/**
 * Monthly threshold calibration from Framework 3.0 §7 entry log.
 *
 * Usage:
 *   npx tsx scripts/calibrate-from-entry-log.ts [path/to/entry-log.csv]
 *
 * Export your spreadsheet as CSV (see data/entry-log.template.csv for columns).
 * Private trades stay local — add data/entry-log.csv to .gitignore.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { T } from '../lib/config/thresholds';

type Row = Record<string, string>;

type Trade = {
  date: string;
  ticker: string;
  droppinessScore: number | null;
  spikeCount: number | null;
  capacityQuarters: number | null;
  shortCheckRating: number | null;
  pnlPct: number | null;
  tookTrade: boolean;
  bypassedWalkaway: boolean;
};

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function num(row: Row, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (!v) continue;
    const n = Number(v.replace(/[%$,]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function bool(row: Row, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = (row[k] ?? '').toLowerCase();
    if (v === 'y' || v === 'yes' || v === 'true' || v === '1') return true;
    if (v === 'n' || v === 'no' || v === 'false' || v === '0') return false;
  }
  return false;
}

function toTrade(row: Row): Trade | null {
  const ticker = (row.ticker ?? row.symbol ?? '').toUpperCase();
  if (!ticker) return null;

  let pnlPct = num(row, 'outcome_pnl_pct', 'pnl_pct', 'pnl', 'outcome_pct');
  if (pnlPct == null) {
    const outcome = (row.outcome ?? row.result ?? '').toLowerCase();
    if (outcome === 'win' || outcome === 'w') pnlPct = 1;
    else if (outcome === 'loss' || outcome === 'l') pnlPct = -1;
    else if (outcome === 'breakeven' || outcome === 'be') pnlPct = 0;
  }

  return {
    date: row.date ?? row.timestamp ?? '',
    ticker,
    droppinessScore: num(row, 'droppiness_score', 'droppiness', 'drop_score'),
    spikeCount: num(row, 'spike_count', 'spikes'),
    capacityQuarters: num(row, 'capacity_quarters', 'baby_shelf_quarters', 'capacity_q'),
    shortCheckRating: num(row, 'short_check_rating', 'rating', 'short_check_pct'),
    pnlPct,
    tookTrade: bool(row, 'took_trade', 'traded') || pnlPct != null,
    bypassedWalkaway: bool(row, 'bypassed_walkaway', 'ignored_veto', 'rule_break'),
  };
}

type Bucket = { label: string; trades: Trade[] };

function bucket(trades: Trade[], label: string, pred: (t: Trade) => boolean): Bucket {
  return { label, trades: trades.filter(pred) };
}

function summarize(bucket: Bucket) {
  const withPnl = bucket.trades.filter((t) => t.pnlPct != null);
  const wins = withPnl.filter((t) => (t.pnlPct as number) > 0);
  const losses = withPnl.filter((t) => (t.pnlPct as number) < 0);
  const avgPnl =
    withPnl.length > 0
      ? withPnl.reduce((s, t) => s + (t.pnlPct as number), 0) / withPnl.length
      : null;
  return {
    n: bucket.trades.length,
    withOutcome: withPnl.length,
    wins: wins.length,
    losses: losses.length,
    winRate: withPnl.length > 0 ? wins.length / withPnl.length : null,
    avgPnlPct: avgPnl,
  };
}

function printBucket(title: string, b: Bucket) {
  const s = summarize(b);
  const wr = s.winRate != null ? `${(s.winRate * 100).toFixed(0)}%` : 'n/a';
  const ap = s.avgPnlPct != null ? `${s.avgPnlPct.toFixed(2)}%` : 'n/a';
  console.log(`  ${title.padEnd(42)} n=${s.n}  outcomes=${s.withOutcome}  W/L=${s.wins}/${s.losses}  winRate=${wr}  avgPnl=${ap}`);
}

function main() {
  const file = resolve(process.argv[2] ?? 'data/entry-log.csv');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.error(`Cannot read ${file}`);
    console.error('Copy data/entry-log.template.csv → data/entry-log.csv and export your spreadsheet.');
    process.exit(1);
  }

  const trades = parseCsv(text).map(toTrade).filter((t): t is Trade => t != null);
  const executed = trades.filter((t) => t.tookTrade);

  console.log('\n=== Entry log calibration ===');
  console.log(`File: ${file}`);
  console.log(`Rows: ${trades.length}  |  Trades with outcome: ${executed.length}`);
  console.log(`Thresholds (lib/config/thresholds.ts):`);
  console.log(`  droppiness.walkAway = ${T.droppiness.walkAway}  (minSpikes = ${T.droppiness.minSpikes})`);
  console.log(`  babyShelf.criticalQuarters = ${T.babyShelf.criticalQuarters}`);
  console.log(`  dataQuality.minCompleteness = ${T.dataQuality.minCompleteness}`);

  if (executed.length === 0) {
    console.log('\nNo trades with outcomes yet. Log at least date, ticker, droppiness_score, outcome_pnl_pct.');
    process.exit(0);
  }

  console.log('\n--- Droppiness (walk-away if score < 40 and spikes >= 3) ---');
  printBucket(
    `Would veto (drop < ${T.droppiness.walkAway}, spikes >= ${T.droppiness.minSpikes})`,
    bucket(executed, 'veto', (t) =>
      t.droppinessScore != null &&
      t.spikeCount != null &&
      t.droppinessScore < T.droppiness.walkAway &&
      t.spikeCount >= T.droppiness.minSpikes
    )
  );
  printBucket(
    `Took anyway (veto zone + bypassed)`,
    bucket(executed, 'bypass', (t) =>
      t.bypassedWalkaway &&
      t.droppinessScore != null &&
      t.spikeCount != null &&
      t.droppinessScore < T.droppiness.walkAway &&
      t.spikeCount >= T.droppiness.minSpikes
    )
  );
  printBucket(`UNVERIFIED zone (spikes < ${T.droppiness.minSpikes})`, bucket(executed, 'unverified', (t) =>
    t.spikeCount != null && t.spikeCount < T.droppiness.minSpikes
  ));
  printBucket(`Strong droppiness (>= ${T.droppiness.strong})`, bucket(executed, 'strong', (t) =>
    t.droppinessScore != null && t.droppinessScore >= T.droppiness.strong
  ));
  printBucket(`Mid band (${T.droppiness.walkAway}–${T.droppiness.strong})`, bucket(executed, 'mid', (t) =>
    t.droppinessScore != null &&
    t.droppinessScore >= T.droppiness.walkAway &&
    t.droppinessScore < T.droppiness.strong
  ));

  console.log('\n--- Baby shelf (walk-away if capacityQuarters < 1) ---');
  printBucket(
    `Critical shelf (< ${T.babyShelf.criticalQuarters} q)`,
    bucket(executed, 'shelf', (t) =>
      t.capacityQuarters != null && t.capacityQuarters < T.babyShelf.criticalQuarters
    )
  );
  printBucket(
    `Took anyway (critical shelf + bypassed)`,
    bucket(executed, 'shelf-bypass', (t) =>
      t.bypassedWalkaway &&
      t.capacityQuarters != null &&
      t.capacityQuarters < T.babyShelf.criticalQuarters
    )
  );

  console.log('\n--- Short Check rating bands ---');
  printBucket('Rating > 80 (High-Priority band)', bucket(executed, 'hi', (t) =>
    t.shortCheckRating != null && t.shortCheckRating > 80
  ));
  printBucket('Rating 70–80', bucket(executed, 'mod', (t) =>
    t.shortCheckRating != null && t.shortCheckRating >= 70 && t.shortCheckRating <= 80
  ));
  printBucket('Rating < 70', bucket(executed, 'lo', (t) =>
    t.shortCheckRating != null && t.shortCheckRating < 70
  ));

  const bypassLosses = executed.filter(
    (t) => t.bypassedWalkaway && t.pnlPct != null && t.pnlPct < 0
  );
  const vetoWins = executed.filter(
    (t) =>
      t.droppinessScore != null &&
      t.spikeCount != null &&
      t.droppinessScore < T.droppiness.walkAway &&
      t.spikeCount >= T.droppiness.minSpikes &&
      t.pnlPct != null &&
      t.pnlPct > 0 &&
      !t.bypassedWalkaway
  );

  console.log('\n--- Signals (heuristic — review manually) ---');
  if (bypassLosses.length > 0) {
    console.log(`  ${bypassLosses.length} losing trade(s) where walk-away was bypassed — vetoes may be well-calibrated.`);
  }
  if (vetoWins.length > 0) {
    console.log(`  ${vetoWins.length} winning trade(s) in droppiness veto zone — consider whether walkAway=${T.droppiness.walkAway} is too strict.`);
  }
  if (executed.length < 15) {
    console.log(`  Only ${executed.length} trade(s) — wait for ~15–20 before changing T.* values.`);
  } else {
    console.log('  Enough rows for a first-pass review. Change thresholds only with a written hypothesis.');
  }
  console.log('');
}

main();
