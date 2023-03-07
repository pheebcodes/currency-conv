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

	formatAmount(locale = "en-US") {
		return this.#format(locale, this.to, this.amount);
	}

	formatOriginalAmount(locale) {
		return this.#format(locale, this.from, this.originalAmount);
	}

	#format(locale, currency, amount) {
		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
		});

		return formatter.format(amount);
	}

	get amount() {
		return this.#exchangeRate.rate * this.#originalAmount;
	}

	get originalAmount() {
		return this.#originalAmount;
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

export class ExchangeNotFoundError extends Error {
	constructor() {
		super("Exchange not found.");
	}
}
