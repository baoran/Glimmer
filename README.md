# Glimmer

Glimmer is an A-share market intelligence dashboard that brings together major market indices, sector performance, stock-level data, financial news, historical snapshots, and rule-based stock screening.

## Features

- Market overview for major A-share indices and sectors
- Searchable and filterable coverage of Shanghai, Shenzhen, Beijing, and STAR Market stocks
- Daily financial news from multiple public sources
- Historical news and stock snapshots
- Rule-based stock suggestions across several trading strategies
- Light and dark display modes

## Project Structure

- `app/` contains the dynamic Sites application.
- `github-pages/` contains the static GitHub Pages build.
- `scripts/` contains data-refresh and publishing utilities.
- `.github/workflows/update-pages.yml` runs the scheduled daily update.

## Daily Updates

The GitHub Actions workflow runs at 16:10 China Standard Time on trading days. It refreshes the latest market data, news archive, stock snapshots, and rule-based suggestions, then publishes the updated static site.

The update can also be triggered manually from GitHub Actions or locally:

```bash
npm run pages:update
```

## Local Development

Prerequisite: Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Disclaimer

All market data and strategy results are provided for research and informational purposes only. Nothing in this project constitutes investment advice.
