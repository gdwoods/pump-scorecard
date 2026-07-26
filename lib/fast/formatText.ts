// lib/fast/formatText.ts
import type { FastVerdict } from './types';

function pct(n: number | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return `${(n * 100).toFixed(digits)}%`;
}

function num(n: number | null, digits = 1): string {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return n.toFixed(digits);
}

export function formatFastVerdictText(v: FastVerdict): string {
  const sourcesAttempted = 8;
  const sourcesOk = Math.round(v.dataCompleteness * sourcesAttempted);
  const lines: string[] = [];

  lines.push(
    `${v.ticker}  ${v.verdict}   (${v.elapsedMs}ms, data ${sourcesOk}/${sourcesAttempted}${v.reason ? `, ${v.reason}` : ''})`
  );
  lines.push(
    `Move    ${pct(v.price.todayMovePct)} today | vol ${num(v.price.volVs20d, 1)}x 20d avg | float rot ${num(v.price.floatRotation, 1)}x`
  );
  lines.push(
    `Runner  ${v.runner.class} — prior day ${pct(v.runner.priorDayPct)}, 3d ${pct(v.runner.threeDayRunPct)}, ${pct(v.runner.pctOff20dHigh)} off 20d high`
  );

  if (v.droppiness.status === 'UNVERIFIED') {
    lines.push(`Drop    UNVERIFIED (${v.droppiness.reason ?? 'not_cached'})`);
  } else {
    lines.push(
      `Drop    ${v.droppiness.score ?? 'n/a'} (${v.droppiness.spikeCount ?? '?'} spikes${v.droppiness.computedAt ? `, ${v.droppiness.computedAt}` : ''})`
    );
  }

  if (v.filings.today.length > 0) {
    const f = v.filings.today[0];
    lines.push(`Filings ${f.form} filed ${f.filedAt}  ← ${f.signal}`);
  } else {
    lines.push(`Filings none recent${v.filings.daysSinceLast != null ? ` (last ${v.filings.daysSinceLast}d ago)` : ''}`);
  }

  const newsLine =
    v.news.class === 'NONE'
      ? 'News    none'
      : `News    ${v.news.class}${v.news.headline ? ` — ${v.news.headline.slice(0, 80)}` : ''}${v.news.ageMinutes != null ? ` (${v.news.ageMinutes}m)` : ''}`;
  lines.push(newsLine);

  lines.push(
    `Fund    cap ${v.fundamentals.marketCap != null ? `$${(v.fundamentals.marketCap / 1e6).toFixed(1)}M` : 'n/a'} | float ${v.fundamentals.float != null ? `${(v.fundamentals.float / 1e6).toFixed(2)}M` : 'n/a'} | IO ${pct(v.fundamentals.instOwn, 1)} | SI ${pct(v.fundamentals.shortInterest, 1)} | runway ${num(v.fundamentals.runwayMonths, 1)}mo`
  );
  lines.push(
    `Borrow  ${v.borrow.available == null ? 'unknown' : v.borrow.available ? 'available' : 'UNAVAILABLE'}${v.borrow.feePct != null ? `, ${v.borrow.feePct}% fee` : ''}`
  );
  lines.push(
    `Dilute  ability ${v.dilution.derivedOfferingAbility} | baby shelf ${v.dilution.babyShelfCapacity != null ? `$${(v.dilution.babyShelfCapacity / 1e6).toFixed(2)}M` : 'n/a'} | ${num(v.dilution.capacityQuarters, 2)} qtrs capacity`
  );

  if (v.flags.length) {
    lines.push('FLAGS   ' + v.flags.join('\n        '));
  }
  if (v.unavailable.length) {
    lines.push('MISSING ' + v.unavailable.join(', '));
  }

  return lines.join('\n');
}
