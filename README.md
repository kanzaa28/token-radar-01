# Token Radar — make.fun `token-radar-01` (practice entry, radar-2)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kanzaa28/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kanzaa28/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot (758 protocols, 14 Nov 2026),
ranks the pre-token protocols by an implied value, and hands a reader a farm plan for
each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty,
$1,325 in USDC (1st $1,000).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, scores every pre-token
protocol, writes the ranked board to `out/board.json`, the dashboard data to `out/data.js`,
copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with the
vendored make.fun library.

## The model (radar-2)

One function scores every protocol — no name is special-cased:

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.03 x min(chains - 1, 5)) )
```

- **TVL** is the base: a bigger protocol's token is worth more.
- **Seven-day growth** rewards momentum and punishes decline, clamped so one wild week
  cannot dominate.
- **Age with no token** is maturity: the longer a protocol has run without issuing a
  token, the more its launch is worth waiting for (unknown age counts as 365 days).
- **Breadth** is new in radar-2: each extra chain adds 3%, up to 5 extra chains, because
  a launch on more chains reaches more farmers.

The board covers all 40 watchlist protocols plus the 160 largest pre-token protocols
below the $50M floor — 200 rows. The 24 largest live-token protocols are set aside in
their own view with their market caps, never mixed into the ranking. Every row carries
a 7-step farm plan derived from its own category, chains, TVL and age, each step with
its cost and time.

## The dashboard

`dashboard/` is a static page with no network: a top-10 strip, a sortable board, search,
category and chain filters, a watchlist-only toggle, a live-token view, and a detail
drawer per protocol that recomputes the row's implied value in the page and checks it
against `board.json`. Screenshots in `screenshots/` are real renders of this page
(board, detail, filtered view) at 1440x900.

## Measured results (dev snapshot, 14 Nov 2026)

- Board: 200 rows, ranks 1..200, implied value $625,181,492 (Steakhouse Financial)
  down to $1,128,471. All 40 watchlist slugs covered.
- Two runs of `main.ts` write byte-identical output (deterministic).
- Gate check (`../gate-check.mjs`): all seven scorer rows pass — dashboard files,
  board file, sorted-by-value, coverage, farm steps, screenshots, dossier byte-identical.
  Dossier 778,747 bytes (cap 1.5 MB); dashboard source 36,488 bytes, whole in the dossier.
- Official kit check (`node cli/makefun.mjs check`): 4 passed (competition open,
  size caps, MIT license, main.ts entrypoint). 1 failed: `transcripts_present` — this
  harness keeps no session record, so there is no bundle to check. 5 items are checked
  only at submission (public repo, owner, created-after-open, commit pushed, no duplicate).

## What is missing for a real submission

- A **public GitHub repository** created after the competition opened (14 Nov 2026
  10:00 UTC), owned by the entrant's GitHub login (or carrying `.makefun/owner.json`
  with the account wallet `5WZTqcSuhjjizXsWk2pF7RyoN1UrYFAbT1xLWYxdqb5d`), with this
  code pushed to it. GitHub is not connected on this VM.
- **Recorded AI sessions**: the entry needs the transcript bundle of the sessions that
  built it. This harness keeps no session record; the build would have to run in a
  client whose sessions are recorded (Claude Code / Codex / Superbot on the user's own
  computer). Note `handed_over_places` for this competition is `none`: a handed-over
  entry is ranked but cannot take a paid place.
- The user's **go-ahead** before any submission. Nothing here has been submitted.

Entries close 14 Dec 2026 10:00 UTC (18:00 WITA).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
