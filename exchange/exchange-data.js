export class ExchangeData {
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
		return new ExchangeData(this.#to, this.#from, 1 / this.rate, this.expiry);
	}

	isExpired() {
		return this.expiry < Date.now();
	}
}

const exchangeDataStoreInternals = Symbol();
export class ExchangeDataStore {
	static #knownInvalidExchangeKeys = new Set();

	#currencySymbolToName;
	#exchangeDataByKey;

	constructor(maybeExchangeData) {
		const maybeInternals = maybeExchangeData?.[exchangeDataStoreInternals];
		this.#currencySymbolToName = new Map(maybeInternals?.currencySymbolToName);
		this.#exchangeDataByKey = new Map(maybeInternals?.exchangeDataByKey);
	}

	add(from, to, rate, expiry) {
		const exchangeData = new ExchangeData(from, to, rate, expiry);
		this.#addExchangeData(exchangeData);
		this.#addExchangeData(exchangeData.inverse);
	}

	#addExchangeData(exchangeData) {
		this.#exchangeDataByKey.set(this.#exchangeDataKeyFor(exchangeData.from, exchangeData.to), exchangeData);
	}

	get(from, to) {
		const key = this.#exchangeDataKeyFor(from, to);
		return this.#exchangeDataByKey.get(key);
	}

	addInvalidExchange(from, to) {
		ExchangeDataStore.#knownInvalidExchangeKeys.add(this.#exchangeDataKeyFor(from, to));
		ExchangeDataStore.#knownInvalidExchangeKeys.add(this.#exchangeDataKeyFor(to, from));
	}

	isInvalidExchange(from, to) {
		return ExchangeDataStore.#knownInvalidExchangeKeys.has(this.#exchangeDataKeyFor(from, to));
	}

	isCurrencySymbol(symbol) {
		return this.#currencySymbolToName.has(symbol);
	}

	getCurrencyName(symbol) {
		return this.#currencySymbolToName.get(symbol);
	}

	#exchangeDataKeyFor(from, to) {
		return `${from}-${to}`;
	}

	get [exchangeDataStoreInternals]() {
		return {
			currencySymbolToName: this.#currencySymbolToName,
			exchangeDataByKey: this.#exchangeDataByKey,
		};
	}

	static initialize(currencySymbolToName) {
		return new ExchangeDataStore({
			[exchangeDataStoreInternals]: {
				currencySymbolToName,
			},
		});
	}
}
