import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Exchange, ExchangeFactory } from "./exchange.ts";

class AuthenticationError extends Error {}

const exchangeFactory = new ExchangeFactory(
	z.string().parse(Bun.env.OPEN_EXCHANGE_RATES_APP_ID)
);
exchangeFactory.fetchingEvent.add(() => {
	console.log("[%s] Fetching rates...", new Date().toISOString());
});

const app = new Hono();

app.use(async (c, next) => {
	c.header("x-powered-by", "currency-conv");
	await next();
});

if (Bun.env.AUTH_OFF !== "true") {
	app.use(async (c, next) => {
		if (c.req.header("authorization") !== Bun.env.PASSWORD) {
			throw new AuthenticationError();
		}
		await next();
	});
}

app.get(
	"/api/rate",
	zValidator(
		"query",
		z.object({
			from: z.string().length(3),
			to: z.string().length(3),
		})
	),
	async (c) => {
		const { from, to } = c.req.valid("query");

		const exchange: Exchange = await exchangeFactory.getExchange();
		exchange.assertIsCurrencyCode(from);
		exchange.assertIsCurrencyCode(to);

		const rate = exchange.getRate(from, to);
		return c.json({
			from,
			to,
			rate,
		});
	}
);

app.post(
	"/api/exchange",
	zValidator(
		"json",
		z.object({
			from: z.string().length(3),
			to: z.string().length(3),
			amount: z.coerce.number(),
			locale: z.string().default("en-US"),
		})
	),
	async (c) => {
		const { from, to, amount, locale } = c.req.valid("json");

		const exchange: Exchange = await exchangeFactory.getExchange();
		exchange.assertIsCurrencyCode(from);
		exchange.assertIsCurrencyCode(to);

		const rate = exchange.getRate(from, to);
		const resultAmount = exchange.exchange(amount, from, to);
		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: to,
		});
		return c.json({
			from,
			to,
			amount: formatter.format(resultAmount),
			rate,
		});
	}
);

app.get("/api/version", async (c) => {
	return c.text(Bun.env.COMMIT_SHA ?? "");
});

const port = z.coerce.number().parse(process.env.PORT ?? 3000);
export default {
	port,
	fetch: app.fetch,
};
