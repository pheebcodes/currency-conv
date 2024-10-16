type Listener<Data> = (data: Data) => unknown;

export class Event<Data> {
	#listeners = new Set<Listener<Data>>();

	emit(data: Data) {
		for (const listener of this.#listeners) {
			process.nextTick(() => {
				listener(data);
			});
		}
	}

	get delegate(): {
		add: Event<Data>["add"];
		remove: Event<Data>["remove"];
	} {
		return {
			add: this.add.bind(this),
			remove: this.remove.bind(this),
		};
	}

	add(listener: Listener<Data>) {
		this.#listeners.add(listener);
	}

	remove(listener: Listener<Data>) {
		this.#listeners.delete(listener);
	}
}
