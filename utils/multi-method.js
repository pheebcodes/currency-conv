export class NoImplError extends Error {}

export class MultiMethod {
	#map = new WeakMap();

	impl(proto, implementation) {
		this.#map.set(proto, implementation);
	}

	invoke(obj, ...args) {
		let cur = obj.constructor;
		while (cur && !this.#map.has(cur) && Object.getPrototypeOf(cur)) {
			cur = Object.getPrototypeOf(cur);
		}
		const impl = this.#map.get(cur);
		if (!impl) {
			throw new NoImplError();
		}
		return impl(obj, ...args);
	}
}
