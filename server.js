import "dotenv/config";
import Express from "express";
import { z } from "zod";
import { Exchange, ExchangeRateError, ExchangeNotFoundError, InvalidCurrencyCodeError } from "./exchange/exchange.js";

const exchangeRate = new Exchange(process.env.OPEN_EXCHANGE_RATES_APP_ID);
exchangeRate.on("fetching", ({ base }) => {
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
			res.status(403).send();
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
	exchangeRate.getRate(from, to).then((exchangeRate) => {
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
});
app.post("/api/exchange", (req, res, next) => {
	const bodyResult = exchangeValidator.safeParse(req.body);
	if (!bodyResult.success) {
		throw new UsageError(
			"The body parameters 'from' and 'to' should be valid, 3-letter string currency codes, and 'amount' should be a number.",
		);
	}
	const { from, to, amount } = bodyResult.data;
	exchangeRate.exchange(amount, from, to).then((exchangedAmount) => {
		res.json({
			from,
			to,
			result: exchangedAmount,
		});
	}, next);
});

app.use((err, _req, res, _next) => {
	if (err instanceof ExchangeNotFoundError) {
		res.status(400).json({ error: err.message });
		return;
	}
	if (err instanceof ExchangeRateError) {
		res.status(400).json({ error: err.message });
		return;
	}
	if (err instanceof InvalidCurrencyCodeError) {
		res.status(400).json({ error: err.message });
		return;
	}
	if (err instanceof UsageError) {
		res.status(400).json({ error: err.message });
		return;
	}
	res.status(500).json({ error: "Unknown error." });
	console.error("Encountered unknown error", err);
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

if (Number.isNaN(port)) {
	console.error("Not a valid port.");
	process.exit(1);
}

app.listen(port, () => {
	console.log(`currency-conv listening on port ${port}`);
});

class UsageError extends Error {}
