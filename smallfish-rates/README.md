# SmallFishMacro Terminal — Rates Regime Dashboard

A rates regime dashboard tracking Fed funds implied path, FOMC meeting probabilities, yield curve dynamics, and inflation models. Built with Next.js 14 for Vercel deployment.

## Features

- **Fed Funds Implied Path** — Step chart of market-implied rate trajectory through 2027
- **FOMC Meeting Probabilities** — Hold/Cut25/Cut50 probabilities per meeting (FedWatch-style)
- **FF Futures Strip** — Full contract strip with implied rates and OCR changes
- **Yield Curve Spreads** — 2s10s, 3m10y, 5s30s, real vs nominal decomposition
- **Inflation Models** — CPI, Core CPI, PCE, Core PCE with YoY/MoM views + 3M moving average
- **Breakeven Inflation** — 5Y/10Y breakevens, 5Y5Y forward, TIPS yields
- **Live FRED API** — All data sourced from Federal Reserve Economic Data (free)

## Data Sources

All data is fetched from the **FRED API** (Federal Reserve Bank of St. Louis), which is free with registration:
- Treasury yields (1M through 30Y)
- EFFR and SOFR rates
- CPI and PCE inflation indices
- Breakeven inflation rates and TIPS yields
- Yield curve spreads

Meeting probabilities are **computed** from the yield curve using the CME FedWatch methodology (binary probability tree from implied rates).

## Quick Start

```bash
# Install
npm install

# Set your free FRED API key
cp .env.example .env.local
# Edit .env.local with your key from https://fred.stlouisfed.org/docs/api/api_key.html

# Dev
npm run dev

# Build
npm run build
```

## Deploy to Vercel

1. Push to GitHub
2. Import in [vercel.com](https://vercel.com)
3. Add environment variable: `FRED_API_KEY` = your key
4. Deploy

The dashboard also supports entering the API key directly in the UI — it gets saved to localStorage and passed as a query parameter to the API route.

## Architecture

```
app/
  page.js           — Main dashboard (client component)
  layout.js         — Root layout with metadata
  globals.css       — Terminal aesthetic + Tailwind
  api/rates/route.js — Server-side FRED API fetching + caching (ISR 1hr)

components/
  Header.js         — SmallFishMacro branding + nav tabs
  MetricBoxes.js    — Top-row summary metrics
  MeetingsView.js   — Implied path chart + probability table
  StripTable.js     — FF futures strip table
  SpreadsView.js    — Yield curve spreads + chart
  InflationPanel.js — CPI/PCE charts + key rates + breakevens
  StatusBar.js      — Footer with status and links

lib/
  fred.js           — FRED API helpers + FedWatch computation
  constants.js      — FOMC dates, dot plot, fallback data
```

## Part of SmallFishMacro Terminal

- **Rates Regime**: This app → `smallfish-rates.vercel.app`
- **Buy The Dip**: [smallfish-btd.vercel.app](https://smallfish-btd.vercel.app/)
- **Market Risk**: [smallfish-market-risk.vercel.app](https://smallfish-market-risk.vercel.app/)

---

Data attribution: Federal Reserve Bank of St. Louis (FRED). Rate probabilities computed from yield curve data, not sourced from CME Group.
