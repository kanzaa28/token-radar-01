# Token Launch Radar — make.fun `token-radar-01`

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for token launches that have not happened yet. It reads one sealed
DefiLlama snapshot (758 protocols, taken 14 Nov 2026), ranks the protocols
that still have no token by the value a launch would carry under one stated
model, and writes a farm plan for every row. Built by an AI agent for
make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. One run writes the whole result set:
`board.json` (the ranked board), `data.js` (the same board for the page),
`dashboard/` and `screenshots/` (copied across), and `dossier.json` — the
vendored make.fun library's digest of the set, written last so it covers
everything before it. A board that fails the gate's shape is refused before
anything is written.

## The model (radar-2)

One function scores every protocol; no name is special-cased:

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.03 x min(chains - 1, 5)) )
```

- **TVL** is the base: a bigger protocol's token is worth more.
- **Seven-day growth** rewards momentum and punishes decline, clamped so a
  single wild week cannot dominate the ranking.
- **Age with no token** is maturity: the longer a protocol has run without
  issuing a token, the more its launch is worth waiting for. An unknown age
  is scored as 365 days.
- **Breadth**: each extra chain adds 3%, up to five, because a launch on
  more chains reaches more farmers.

The board is the snapshot's 40-protocol watchlist in full, plus the 160
largest pre-token protocols below the $50M watchlist floor — 200 rows,
ranks 1..200, implied value from $625,181,492 down to $1,128,471. The 24
largest protocols that already trade are never ranked; the page sets them
aside with their market caps. Each board row carries a seven-step farm
plan derived from its own category, chains, TVL and age, every step with
its cost and its time.

## The dashboard

`dashboard/` is a static page with no network calls: a top-10 strip, the
ranked board with sortable columns, search, category and chain filters, a
watchlist-only toggle, a live-token view, and a per-protocol sheet that
recomputes the row's implied value in the page and checks it against
`board.json` before showing the farm plan. The screenshots under
`screenshots/` are real renders of this page (the board, one protocol's
sheet, a filtered view) at 1280x900.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
