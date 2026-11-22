-- Home currency (rough estimates of other currencies, display only) and
-- Market Green as the base theme.
--
-- users.home_currency: NULL = not chosen yet (the app asks on next sign-in),
-- 'none' = estimates turned off, else a currency code. Everyone who already
-- has an account is set to SGD; new accounts start NULL and get asked.
--
-- fx_rates: the latest mid-market rates per base currency, fetched from
-- Frankfurter (api.frankfurter.dev) at most every few hours and cached here.
-- rates is JSON { "<quote>": <units of quote per 1 base> }.
--
-- Kopitiam is retired; anyone on it moves to Market Green, keeping their mode.
ALTER TABLE users ADD COLUMN home_currency TEXT;
UPDATE users SET home_currency = 'SGD';
UPDATE users SET theme = 'market' WHERE theme = 'kopitiam';

CREATE TABLE IF NOT EXISTS fx_rates (
  base TEXT PRIMARY KEY,
  rate_date TEXT,
  rates TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
