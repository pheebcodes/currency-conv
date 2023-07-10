import Got from "got";
import { EventEmitter } from "events";
import { ExchangeRateStore } from "./exchange-data.js";
import { ExpiredError, Expiring } from "../utils/expiring.js";

export { InvalidCurrencyCodeError, ExchangeRateError } from "./exchange-data.js";

export class Exchange {
	#api;
	#expiringExchangeRateStore;
	#ee = new EventEmitter();

	constructor(openExchangeAppId, { expiresIn = 1000 * 60 * 60 } = {}) {
		this.#api = Got.extend({
			prefixUrl: "https://openexchangerates.org/api",
			searchParams: {
				app_id: openExchangeAppId,
			},
		});

		this.#expiringExchangeRateStore = new Expiring(expiresIn);
	}

	async exchange(amount, from, to) {
		const exchangeRate = await this.getRate(from, to);
		return new ExchangeResult(exchangeRate, amount);
	}

	async getRate(from, to) {
		const exchangeRateStore = await this.#getExchangeRateStore();

		const exchangeRate = exchangeRateStore.get(from, to);
		if (!exchangeRate) {
			throw new ExchangeNotFoundError();
		}
		return exchangeRate;
	}

	#getExchangeRateStore() {
		try {
			return this.#expiringExchangeRateStore.get();
		} catch (err) {
			if (!(err instanceof ExpiredError)) {
				throw err;
			}

			this.#ee.emit("fetching", { base: "USD" });
			const next = this.#api
				.get("latest.json", { searchParams: { base: "USD" } })
				.json()
				.then(async (result) => new ExchangeRateStore(result.rates));
			this.#expiringExchangeRateStore.renew(next);
			return next;
		}
	}

	on(event, fn) {
		this.#ee.on(event, fn);
	}

	off(event, fn) {
		this.#ee.off(event, fn);
	}
}

class ExchangeResult {
	#exchangeRate;
	#originalAmount;

	constructor(exchangeRate, originalAmount) {
		this.#exchangeRate = exchangeRate;
		this.#originalAmount = originalAmount;
	}

	get amount() {
		return new CurrencyValue(this.#exchangeRate.rate * this.#originalAmount, this.to);
	}

	get originalAmount() {
		return new CurrencyValue(this.#originalAmount, this.from);
	}

	get from() {
		return this.#exchangeRate.from;
	}

	get to() {
		return this.#exchangeRate.to;
	}

	get rate() {
		return this.#exchangeRate.rate;
	}
}

class CurrencyValue {
	#amount;
	#currencyCode;

	constructor(amount, currencyCode) {
		this.#amount = amount;
		this.#currencyCode = currencyCode;
	}

	get amount() {
		return this.#amount;
	}

	get currencyCode() {
		return this.#currencyCode;
	}

	format(locale = "en-US") {
		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: this.currencyCode,
		});

		return formatter.format(this.amount);
	}
}

export class ExchangeNotFoundError extends Error {
	constructor() {
		super("Exchange not found.");
	}
}
