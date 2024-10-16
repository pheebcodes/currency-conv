import Got from "got";
import assert from "assert";
import { z } from "zod";
import { Event } from "./utils/event.ts";
import { AsyncCached } from "./utils/cache.ts";

declare const currencyCodeTag: unique symbol;
type CurrencyCode = string & { [currencyCodeTag]: void };
type RatesRecord = Record<CurrencyCode, number>;

export class Exchange {
	#currencyCodes: Set<CurrencyCode>;
	#rates: RatesRecord;

	constructor({
		currencyCodes,
		rates,
	}: {
		currencyCodes: Set<CurrencyCode>;
		rates: RatesRecord;
	}) {
		this.#currencyCodes = currencyCodes;
		this.#rates = rates;
	}

	exchange(amount: number, from: CurrencyCode, to: CurrencyCode) {
		const rate = this.getRate(from, to);
		return rate * amount;
	}

	getRate(from: CurrencyCode, to: CurrencyCode) {
		const rates = this.getRates();
		return (1 / rates[from]) * rates[to];
	}

	getRates() {
		return this.#rates;
	}

	isCurrencyCode(x: unknown): x is CurrencyCode {
		if (typeof x !== "string") {
			return false;
		}
		return this.#currencyCodes.has(x as CurrencyCode);
	}

	assertIsCurrencyCode(x: unknown): asserts x is CurrencyCode {
		assert(this.isCurrencyCode(x), `${x} is not a valid currency code.`);
	}
}

export class ExchangeFactory {
	#api: typeof Got;
	#fetchingEvent = new Event<void>();
	#expiresIn: number;
	static #currencyCodesSchema = z
		.record(z.string(), z.string())
		.transform((record) => Object.keys(record) as CurrencyCode[]);
	static #ratesSchema = z
		.object({
			rates: z.record(z.string(), z.number()),
		})
		.transform(({ rates }) => ({ ...rates, USD: 1 } as RatesRecord));

	get fetchingEvent() {
		return this.#fetchingEvent.delegate;
	}

	constructor(
		openExchangeAppId: string,
		{ expiresIn = 1000 * 60 * 60 }: { expiresIn?: number } = {}
	) {
		this.#api = Got.extend({
			prefixUrl: "https://openexchangerates.org/api",
			searchParams: {
				app_id: openExchangeAppId,
			},
		});
		this.#expiresIn = expiresIn;
	}

	#exchangeCache = new AsyncCached<Exchange>();
	async getExchange() {
		return this.#exchangeCache.get({
			next: async () => {
				this.#fetchingEvent.emit();
				const [rawCurrenciesResult, rawRatesResult] = await Promise.all([
					this.#api.get("currencies.json").json(),
					this.#api
						.get("latest.json", { searchParams: { base: "USD" } })
						.json(),
				]);
				const currencyCodes =
					ExchangeFactory.#currencyCodesSchema.parse(rawCurrenciesResult);
				const ratesResult = ExchangeFactory.#ratesSchema.parse(rawRatesResult);
				return new Exchange({
					currencyCodes: new Set(currencyCodes),
					rates: ratesResult,
				});
			},
			expiresIn: this.#expiresIn,
		});
	}
}
