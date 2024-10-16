export class AsyncCached<Data> {
	#cache: { data: Promise<Data>; expiration: number } | undefined;

	async get({ next, expiresIn }: { next(): Promise<Data>; expiresIn: number }) {
		if (!this.#cache || this.#cache.expiration < Date.now()) {
			this.#cache = {
				data: next(),
				expiration: Date.now() + expiresIn,
			};
		}
		return await this.#cache.data;
	}
}
