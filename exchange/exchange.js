import Got from "got";
import { EventEmitter } from "events";
import { ExchangeDataStore } from "./exchange-data.js";

export class InvalidCurrencySymbolError extends Error {}

export class ExchangeError extends Error {
	#errors;

	constructor(errors) {
		super("Errors while exchanging:\n" + errors.map((e) => `\t${e.message}`).join("\n"));
		this.#errors = errors;
	}

	get errors() {
		return this.#errors;
	}
}

export class NotUSDError extends Error {
	constructor() {
		super("Either 'from' or 'to' should be USD.");
	}
}

export class ExchangeNotFoundError extends Error {
	constructor() {
		super("Exchange not found.");
	}
}

export class Exchange {
	#api;
	#limitedToUsd;
	#rateExpiry;
	#exchangeDataStoreP;

	#ee = new EventEmitter();

	constructor(openExchangeAppId, { limitedToUsd = false, rateExpiry = 1000 * 60 * 60 } = {}) {
		this.#api = Got.extend({
			prefixUrl: "https://openexchangerates.org/api",
			searchParams: {
				app_id: openExchangeAppId,
			},
		});
		this.#limitedToUsd = limitedToUsd;
		this.#rateExpiry = rateExpiry;

		this.#exchangeDataStoreP = this.#api
			.get("currencies.json")
			.json()
			.then((result) => ExchangeDataStore.initialize(new Map(Object.entries(result))));
	}

	async exchange(amount, from, to, { locale = "en-US" } = {}) {
		const rateData = await this.getRate(from, to);

		const exchangedAmount = amount * rateData.rate;
		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: to,
		});

		return formatter.format(exchangedAmount);
	}

	async getRate(from, to) {
		const errors = [];
		let exchangeDataStore = await this.#exchangeDataStoreP;

		if (!exchangeDataStore.isCurrencySymbol(from)) {
			errors.push(
				new InvalidCurrencySymbolError(`Currency '${from}' (provided in the 'from' argument) is not a valid currency.`),
			);
		}

		if (!exchangeDataStore.isCurrencySymbol(to)) {
			errors.push(
				new InvalidCurrencySymbolError(`Currency '${to}' (provided in the 'to' argument) is not a valid currency.`),
			);
		}

		if (this.#limitedToUsd && from !== "USD" && to !== "USD") {
			errors.push(new NotUSDError());
		}

		if (errors.length) {
			throw new ExchangeError(errors);
		}

		if (exchangeDataStore.isInvalidExchange(from, to)) {
			throw new ExchangeNotFoundError();
		}

		let exchangeData = exchangeDataStore.get(from, to);
		if (exchangeData === undefined || exchangeData.isExpired()) {
			exchangeDataStore = await this.#fetch(this.#limitedToUsd ? "USD" : from);
			exchangeData = exchangeDataStore.get(from, to);
		}

		if (exchangeData === undefined) {
			exchangeDataStore.addInvalidExchange(from, to);
			throw new ExchangeNotFoundError();
		}

		return exchangeData;
	}

	#fetch(base) {
		this.#ee.emit("fetching", { base });

		const currentExchangeDataStoreP = this.#exchangeDataStoreP;
		this.#exchangeDataStoreP = this.#api
			.get("latest.json", {
				searchParams: {
					base,
				},
			})
			.json()
			.then(async (result) => {
				const expiry = new Date(Date.now() + this.#rateExpiry);
				const exchangeDataStore = new ExchangeDataStore(await currentExchangeDataStoreP);
				for (const [currencyCode, exchangeRate] of Object.entries(result.rates)) {
					exchangeDataStore.add(base, currencyCode, exchangeRate, expiry);
				}
				return exchangeDataStore;
			});
		return this.#exchangeDataStoreP;
	}

	on(event, fn) {
		this.#ee.on(event, fn);
	}

	off(event, fn) {
		this.#ee.off(event, fn);
	}
}
