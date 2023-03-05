export class Expiring {
	#expiresIn;
	#expiry = 0;
	#value = null;

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
	}
}
