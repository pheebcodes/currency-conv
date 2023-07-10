import "dotenv/config";
import Express from "express";
import { z } from "zod";
import { Exchange, ExchangeRateError, ExchangeNotFoundError, InvalidCurrencyCodeError } from "./exchange/exchange.js";
import { MultiMethod } from "./utils/multi-method.js";

class UsageError extends Error {}
class AuthenticationError extends Error {}

const exchange = new Exchange(process.env.OPEN_EXCHANGE_RATES_APP_ID);
exchange.on("fetching", ({ base }) => {
	console.log(`Fetching '${base}'... ${new Date()}`);
});

const app = Express();

app.disable("x-powered-by");
app.use((_req, res, next) => {
	res.setHeader("x-powered-by", "currency-conv (https://github.com/pheebcodes/currency-conv)");
	next();
});
app.use(Express.json());

if (process.env.AUTH_OFF !== "true") {
	app.use((req, res, next) => {
		if (req.headers.authorization !== process.env.PASSWORD) {
			next(new AuthenticationError());
		} else {
			next();
		}
	});
}

const rateValidator = z.object({
	from: z.string().length(3),
	to: z.string().length(3),
});
app.get("/api/rate", (req, res, next) => {
	const queryResult = rateValidator.safeParse(req.query);
	if (!queryResult.success) {
		throw new UsageError("The search parameters 'from' and 'to' should be valid, 3-letter string currency codes.");
	}
	const { from, to } = queryResult.data;
	exchange.getRate(from, to).then((exchangeRate) => {
		res.json({
			from: exchangeRate.from,
			to: exchangeRate.to,
			rate: exchangeRate.rate,
		});
	}, next);
});

const exchangeValidator = z.object({
	from: z.string().length(3),
	to: z.string().length(3),
	amount: z.coerce.number(),
	locale: z.string().default("en-US"),
});
app.post("/api/exchange", (req, res, next) => {
	const bodyResult = exchangeValidator.safeParse(req.body);
	if (!bodyResult.success) {
		throw new UsageError(
			"The body parameters 'from' and 'to' should be valid, 3-letter string currency codes, and 'amount' should be a number.",
		);
	}
	const { from, to, amount } = bodyResult.data;
	exchange.exchange(amount, from, to).then((exchangeResult) => {
		res.json({
			from: exchangeResult.from,
			to: exchangeResult.to,
			amount: exchangeResult.amount.format(bodyResult.data.locale),
			rate: exchangeResult.rate,
		});
	}, next);
});

app.get("/api/version", (_req, res) => {
	res.type("txt").send(process.env.COMMIT_SHA);
});

const multi = new MultiMethod();
multi.impl(ExchangeNotFoundError, (err) => ({ status: 400, json: { error: err.message } }));
multi.impl(ExchangeRateError, (err) => ({ status: 400, json: { error: err.message } }));
multi.impl(InvalidCurrencyCodeError, (err) => ({ status: 400, json: { error: err.message } }));
multi.impl(UsageError, (err) => ({ status: 400, json: { error: err.message } }));
multi.impl(AuthenticationError, (_err) => ({ status: 400, json: { error: "Invalid authentication." } }));
app.use((err, _req, res, _next) => {
	try {
		const ret = multi.invoke(err);
		res.status(ret.status).json(ret.json);
	} catch (e) {
		res.status(500).json({ error: "Unknown error." });
		console.error("Unknown error responding to request:", err);
	}
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

if (Number.isNaN(port)) {
	console.error("Not a valid port.");
	process.exit(1);
}

app.listen(port, () => {
	console.log(`currency-conv listening on port ${port}`);
});
