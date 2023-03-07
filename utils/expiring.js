export class Expiring {
	#expiresIn;
	#expiry = -1;
	#value;

	constructor(expiresIn) {
		this.#expiresIn = expiresIn;
	}

	isExpired() {
		return this.#expiry < Date.now();
	}

	get() {
		if (this.isExpired()) {
			throw new ExpiredError();
		}
		return this.#value;
	}

	renew(next = this.#value) {
		this.#expiry = Date.now() + this.#expiresIn;
		this.#value = next;
		return this;
	}
}

export class ExpiredError extends Error {}
