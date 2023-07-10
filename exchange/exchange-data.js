export class ExchangeRateStore {
	#exchangeRates;

	constructor(exchangeRates = {}) {
		this.#exchangeRates = new Map(Object.entries(exchangeRates));
	}

	get(from, to) {
		const errors = [];

		if (!this.isValidCurrencyCode(from)) {
			errors.push(
				new InvalidCurrencyCodeError(`Currency '${from}' (provided in the 'from' argument) is not a valid currency.`),
			);
		}

		if (!this.isValidCurrencyCode(to)) {
			errors.push(
				new InvalidCurrencyCodeError(`Currency '${to}' (provided in the 'to' argument) is not a valid currency.`),
			);
		}

		if (errors.length) {
			throw new ExchangeRateError(
				`Cannot exchange ${from} to ${to}.\n` + errors.map((e) => `\t${e.message}`).join("\n"),
			);
		}

		const rate = (1 / this.#exchangeRates.get(from)) * this.#exchangeRates.get(to);
		return new ExchangeRate(from, to, rate);
	}

	isValidCurrencyCode(currencyCode) {
		return this.#exchangeRates.has(currencyCode);
	}
}

export class ExchangeRate {
	#from;
	#to;
	#rate;

	constructor(from, to, rate) {
		this.#from = from;
		this.#to = to;
		this.#rate = rate;
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
}

export class InvalidCurrencyCodeError extends Error {}
export class ExchangeRateError extends Error {}
