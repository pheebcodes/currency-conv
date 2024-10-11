import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
	Exchange,
	ExchangeRateError,
	ExchangeNotFoundError,
	InvalidCurrencyCodeError,
} from "./exchange/exchange.js";
import { MultiMethod } from "./utils/multi-method.js";

class UsageError extends Error {}
class AuthenticationError extends Error {}

const exchange = new Exchange(process.env.OPEN_EXCHANGE_RATES_APP_ID);
exchange.on("fetching", ({ base }) => {
	console.log(`Fetching '${base}'... ${new Date()}`);
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
		z.object({ from: z.string().length(3), to: z.string().length(3) })
	),
	async (c) => {
		const { from, to } = c.req.valid("query");
		const exchangeRate = await exchange.getRate(from, to);
		return c.json({
			from: exchangeRate.from,
			to: exchangeRate.to,
			rate: exchangeRate.rate,
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
		const exchangeResult = await exchange.exchange(amount, from, to);
		return c.json({
			from: exchangeResult.from,
			to: exchangeResult.to,
			amount: exchangeResult.amount.format(locale),
			rate: exchangeResult.rate,
		});
	}
);

app.get("/api/version", async (c) => {
	return c.text(Bun.env.COMMIT_SHA ?? "");
});

const multi = new MultiMethod();
multi.impl(ExchangeNotFoundError, (err) => ({
	status: 400,
	json: { error: err.message },
}));
multi.impl(ExchangeRateError, (err) => ({
	status: 400,
	json: { error: err.message },
}));
multi.impl(InvalidCurrencyCodeError, (err) => ({
	status: 400,
	json: { error: err.message },
}));
multi.impl(UsageError, (err) => ({
	status: 400,
	json: { error: err.message },
}));
multi.impl(AuthenticationError, (_err) => ({
	status: 400,
	json: { error: "Invalid authentication." },
}));
app.onError((err, c) => {
	try {
		const ret = multi.invoke(err);
		c.status(ret.status);
		return c.json(ret.json);
	} catch (e) {
		console.error("Unknown error responding to request:", err);
		c.status(500);
		return c.json({ error: "Unknown error." });
	}
});

const port = z.coerce.number().parse(process.env.PORT ?? 3000);
export default {
	port,
	fetch: app.fetch,
};
