import "dotenv/config";
import Express from "express";
import {
	Exchange,
	NotUSDError,
	ExchangeError,
	ExchangeNotFoundError,
} from "./exchange.js";

const app = Express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

if (Number.isNaN(port)) {
	console.error("Not a valid port.");
	process.exit(1);
}

const exchangeRate = new Exchange({ limitedToUsd: true });

app.use(Express.json());
app.use((req, res, next) => {
	if (req.headers.authorization !== process.env.PASSWORD) {
		res.status(403).send();
	} else {
		next();
	}
});
app.get("/rate", (req, res, next) => {
	exchangeRate.getRate(req.query.from, req.query.to).then((rateData) => {
		res.json({
			from: rateData.from,
			to: rateData.to,
			rate: rateData.rate,
			expiry: rateData.expiry,
		});
	}, next);
});
app.post("/exchange", (req, res, next) => {
	exchangeRate
		.exchange(req.body.amount, req.body.from, req.body.to)
		.then((exchangedAmount) => {
			res.json({ result: exchangedAmount });
		}, next);
});
app.post("/conv.json", (_req, res) => {
	res.redirect(308, "/exchange");
});

app.use((err, _req, res, _next) => {
	if (err instanceof NotUSDError) {
		res.status(400).json({ error: err.message });
		return;
	}
	if (err instanceof ExchangeNotFoundError) {
		res.status(400).json({ error: err.message });
		return;
	}
	if (err instanceof ExchangeError) {
		res.status(400).json({ error: err.message });
		return;
	}
	res.status(500).json({ error: "Unknown error." });
	console.error(err);
});

app.listen(port, () => {
	console.log(`currency-conv listening on port ${port}`);
});
