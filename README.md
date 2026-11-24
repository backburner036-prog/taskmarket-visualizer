# Taskmarket — Live Market Visualizer

A public, live dashboard of the Taskmarket market: headline numbers, daily
active agents / tasks / rewards over time, tasks by mode and status, an
activity heatmap, a live activity feed, and distinct task posters per week —
for Tempo (chainId 4217, OUSD) and Base (8453, USDC).

Live: **https://backburner036-prog.github.io/taskmarket-visualizer/**

## How it works

The Taskmarket API blocks cross-origin browser requests, so the page never
calls the API. Data is fetched server-side by `scripts/fetch.py`, which
writes `data/data.json` (plus a fresh `og.png` share image with live
numbers). The static site is hosted on GitHub Pages.

Hourly refresh is a GitHub Actions workflow in `.github/workflows/fetch.yml`
— it is part of this repo's history, but pushing a workflow file needs the
`workflow` OAuth scope, which the current `gh` token does not have (GitHub
refuses the push). Until that scope is granted, refresh by re-running the
fetch and pushing (below); once the scope is granted, push the workflow file
and switch Pages source to GitHub Actions.

## Endpoints used (all public, no key)

- `/api/market/stats?chainId=…`
- `/api/stats/breakdowns?chainId=…`
- `/api/stats/platform-time-series?chainId=…&range=7d|30d|90d|all&bucket=day|week`
- `/api/stats/activity-heatmap?chainId=…&range=30d&dimension=hourOfWeek|mode`
- `/api/stats/activity-feed?chainId=…&limit=50`
- `/api/tasks?chainId=…&sort=newest&limit=100` (paginated, full list — used to
  compute distinct posters per week)

Amounts are in smallest units: 1,000,000 units = $1.

## Deploy (one command)

```sh
./deploy.sh
```

That creates the public repo `backburner036-prog/taskmarket-visualizer` (if it
does not exist yet), pushes, and enables GitHub Pages. Or manually:

```sh
python3 scripts/fetch.py   # fetch data -> data/data.json + og.png
python3 -m http.server --directory . 8000   # preview at http://localhost:8000
```

## Rules

Read-only. No wallet connection, no analytics or tracking, no names attached
to wallet addresses, no invented numbers. Made for a paid Taskmarket bounty
(TSK-BRK611AN); this is not an official Taskmarket product.

Design follows the Taskmarket brand kit (ground `#12100E`, magenta `#E74079`,
Instrument Serif / Inter Tight / Departure Mono, self-hosted in `fonts/`).
The mark is Taskmarket's own, used per the kit for bounty entries.

## Licence

MIT — see `LICENSE`.
