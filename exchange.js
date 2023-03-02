import Got from "got";

export class NotUSDError extends Error {}
export class InvalidExchangeError extends Error {}
export class Exchange {
	static #api = Got.extend({
		prefixUrl: "https://openexchangerates.org/api",
		searchParams: {
			app_id: process.env.OPEN_EXCHANGE_APP_ID,
		},
	});
	#expires = Date.now();
	#rateMapP;

	async getRate(from, to) {
		if (this.#isExpired) {
			this.#refetch();
		}
		const rateMap = await this.#rateMapP;
		const rateKey = this.#rateKey(from, to);
		if (!rateMap.has(rateKey)) {
			throw new InvalidExchangeError();
		}
		return rateMap.get(rateKey);
	}

	async exchange(amount, from, to, { locale = "en-US" } = {}) {
		if (from !== "USD" && to !== "USD") {
			throw new NotUSDError();
		}
		const rate = await this.getRate(from, to);

		const exchangedAmount = amount * rate;
		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: to,
		});
		return formatter.format(exchangedAmount);
	}

	#refetch() {
		console.log(`Refetching... ${new Date().toString()}`);
		this.#expires = Date.now() + 1000 * 60 * 60 * 24;
		const currentRatesP = this.#rateMapP;
		this.#rateMapP = Exchange.#api
			.get("latest.json")
			.json()
			.then(async (result) => {
				const rateMap = new Map(await currentRatesP);
				for (const [key, value] of Object.entries(result.rates)) {
					rateMap.set(this.#rateKey("USD", key), value);
					rateMap.set(this.#rateKey(key, "USD"), 1 / value);
				}
				return rateMap;
			});
	}

	get #isExpired() {
		return !this.#expires || this.#expires < Date.now();
	}

	#rateKey(from, to) {
		return `${from}-${to}`;
	}
}
