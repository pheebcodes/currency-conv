import Got from "got";

export class InvalidCurrencySymbolError extends Error {}
export class ExchangeError extends Error {
	#errors;

	constructor(errors) {
		super(
			"Errors while exchanging:\n" +
				errors.map((e) => `\t${e.message}`).join("\n"),
		);
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
	static #api = Got.extend({
		prefixUrl: "https://openexchangerates.org/api",
		searchParams: {
			app_id: process.env.OPEN_EXCHANGE_APP_ID,
		},
	});
	static #knownNotFoundExchanges = new Set();

	#limitedToUsd;
	#rateExpiry;

	#rateMapP = Promise.resolve(new Map());
	#currenciesP = Exchange.#api
		.get("currencies.json")
		.json()
		.then((result) => new Map(Object.entries(result)));

	constructor({ limitedToUsd = false, rateExpiry = 1000 * 60 * 60 } = {}) {
		this.#limitedToUsd = limitedToUsd;
		this.#rateExpiry = rateExpiry;
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
		const currencies = await this.#currenciesP;

		if (!currencies.has(from)) {
			errors.push(
				new InvalidCurrencySymbolError(
					`Currency '${from}' (provided in the 'from' argument) is not a valid currency.`,
				),
			);
		}

		if (!currencies.has(to)) {
			errors.push(
				new InvalidCurrencySymbolError(
					`Currency '${to}' (provided in the 'to' argument) is not a valid currency.`,
				),
			);
		}

		if (this.#limitedToUsd && from !== "USD" && to !== "USD") {
			errors.push(new NotUSDError());
		}

		if (errors.length) {
			throw new ExchangeError(errors);
		}

		const rateKey = this.#rateKey({ from, to });

		if (Exchange.#knownNotFoundExchanges.has(rateKey)) {
			throw new ExchangeNotFoundError();
		}

		const rateMap = await this.#rateMapP;
		let rateData = rateMap.get(rateKey);
		if (rateData === undefined || rateData.expiry.getTime() < Date.now()) {
			this.#fetch(this.#limitedToUsd ? "USD" : from);
			const updatedRateMap = await this.#rateMapP;
			rateData = updatedRateMap.get(rateKey);
		}

		if (rateData === undefined) {
			Exchange.#knownNotFoundExchanges.add(rateKey);
			throw new ExchangeNotFoundError();
		}

		return rateData;
	}

	#fetch(base) {
		console.log(`Fetching '${base}'... ${new Date()}`);
		const currentRatesP = this.#rateMapP;
		this.#rateMapP = Exchange.#api
			.get("latest.json", {
				searchParams: {
					base,
				},
			})
			.json()
			.then(async (result) => {
				const expiry = new Date(Date.now() + this.#rateExpiry);
				const rateMap = new Map(await currentRatesP);
				for (const [currencyCode, exchangeRate] of Object.entries(
					result.rates,
				)) {
					const rate = new Rate(base, currencyCode, exchangeRate, expiry);
					rateMap.set(this.#rateKey(rate), rate);
					const rateInverse = rate.inverse;
					rateMap.set(this.#rateKey(rateInverse), rateInverse);
				}
				return rateMap;
			});
	}

	#rateKey({ from, to }) {
		return `${from}-${to}`;
	}
}

class Rate {
	#from;
	#to;
	#rate;
	#expiry;

	constructor(from, to, rate, expiry) {
		this.#from = from;
		this.#to = to;
		this.#rate = rate;
		this.#expiry = expiry;
	}

	get from() {
		return this.#from;
	}

	get to() {
		return this.#to;
	}

	get rate() {
		return this.#rate;
	}

	get expiry() {
		return this.#expiry;
	}

	get inverse() {
		return new Rate(this.#to, this.#from, 1 / this.rate, this.expiry);
	}
}
