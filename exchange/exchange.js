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

	async exchange(amount, from, to, { locale = "en-US" } = {}) {
		const exchangeRate = await this.getRate(from, to);
		const exchangedAmount = amount * exchangeRate.rate;
		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: to,
		});

		return formatter.format(exchangedAmount);
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

export class ExchangeNotFoundError extends Error {
	constructor() {
		super("Exchange not found.");
	}
}
