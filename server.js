import "dotenv/config";
import Express from "express";
import { Exchange, InvalidExchangeError, NotUSDError } from "./exchange.js";

const app = Express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

if (Number.isNaN(port)) {
	console.error("Not a valid port.");
	process.exit(1);
}

const exchangeRate = new Exchange();

app.use(Express.json());
app.use((req, res, next) => {
	if (req.headers.authorization !== process.env.PASSWORD) {
		res.status(403).send();
	} else {
		next();
	}
});
app.post("/conv.json", (req, res) => {
	exchangeRate.exchange(req.body.amount, req.body.from, req.body.to).then(
		(exchangedAmount) => {
			res.json({ result: exchangedAmount });
		},
		(err) => {
			if (err instanceof NotUSDError) {
				res
					.status(400)
					.json({ error: "USD must be either the 'from' or 'to' currency." });
				return;
			}
			if (err instanceof InvalidExchangeError) {
				res.status(400).json({
					error: `Cannot exchange '${req.body.from}' for '${req.body.to}'.`,
				});
				return;
			}
			res.status(500).json({ error: "Unknown error." });
			console.error(err);
		},
	);
});

app.listen(port, () => {
	console.log(`currency-conv listening on port ${port}`);
});
