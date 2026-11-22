// Token launch radar — the entrypoint.
//
//   node main.ts [--input <snapshot.json|dir>] [--output <dir>]
//
// Reads one sealed snapshot, scores its pre-token protocols with the
// model in lib/model.ts, and writes a self-contained result set:
//
//   board.json    the ranked board the scorer reads
//   data.js       the same board, in the shape the page renders
//   dashboard/    the static page (copied from beside this file)
//   screenshots/  the page's renders (copied from beside this file)
//   dossier.json  the vendored library's digest of the whole set,
//                 written last so it can cover everything before it
//
// Node's standard library only, nothing fetched. A board that fails the
// gate's shape — a watchlist protocol missing, ranks out of order, a
// value out of place, a farm step the wrong size — is refused before a
// byte is written, and the run says why.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardDefect, buildBoard, buildPageData, readSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where the snapshot comes from: --input wins, then the harness default. */
function inputPath(argv: string[]): string {
  const at = argv.indexOf('--input');
  const given = at >= 0 ? argv[at + 1] : undefined;
  const base = given ?? '/input';
  return statSync(base, { throwIfNoEntry: false })?.isDirectory() ? join(base, 'snapshot.json') : base;
}

/** Where the result set goes: --output, then the harness variable, then /output. */
function outputDir(argv: string[]): string {
  const at = argv.indexOf('--output');
  const given = at >= 0 ? argv[at + 1] : undefined;
  return given ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The screenshots the page must ship with: real renders, whole images, sane names. */
function checkShots(dir: string): string[] {
  const names = readdirSync(dir).filter((n) => !n.startsWith('.'));
  if (names.length < 3) throw new Error(`screenshots: ${names.length} file(s) in ${dir}; the entry needs at least 3 renders`);
  for (const name of names) {
    if (!SHOT_NAME.test(name)) throw new Error(`screenshots: bad file name ${name}`);
    const head = readFileSync(join(dir, name)).subarray(0, 3);
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e;
    if (!isJpeg && !isPng) throw new Error(`screenshots: ${name} is neither a JPEG nor a PNG image`);
  }
  return names;
}

/** Copy one asset folder beside this file into the output, plain files only. */
function copyAssets(name: string, out: string): void {
  const from = join(HERE, name);
  const into = join(out, name);
  mkdirSync(into, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const src = join(from, entry);
    if (statSync(src).isFile()) copyFileSync(src, join(into, entry));
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  const snapFile = inputPath(argv);
  if (!existsSync(snapFile)) {
    console.error(`token radar: no snapshot at ${snapFile} — pass --input <file|dir>`);
    return 2;
  }
  const snap = readSnapshot(JSON.parse(readFileSync(snapFile, 'utf8')));
  const board = buildBoard(snap);
  const defect = boardDefect(board, snap);
  if (defect !== null) {
    console.error(`token radar: the board fails the gate: ${defect}`);
    return 1;
  }
  const page = buildPageData(snap, board);

  const out = outputDir(argv);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board }, null, 2)}\n`);
  writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(page)};\n`);
  copyAssets('dashboard', out);
  const shots = checkShots(join(HERE, 'screenshots'));
  copyAssets('screenshots', out);

  // The dossier covers the finished set, so it is written after everything else.
  const dossier = buildDossier(out, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(out, 'dossier.json'), dossier);

  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  console.log(
    `token radar: ${board.length} pre-token rows (${page.early_size} early below the floor), ` +
      `${page.live_size} live-token protocols set aside, ${shots.length} screenshots (${shots.map((s) => basename(s)).join(', ')})`,
  );
  console.log(
    `token radar: implied value runs ${money(board[0]!.implied_value_usd)} (${board[0]!.name}) ` +
      `down to ${money(board[board.length - 1]!.implied_value_usd)}; dossier ${Buffer.byteLength(dossier)} bytes`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`token radar: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
