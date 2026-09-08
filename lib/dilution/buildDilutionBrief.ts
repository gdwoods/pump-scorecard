import {
  buildCapitalPressureHeadline,
  findPinnedEvent,
  formatSharesShort,
  formatUsdShort,
  humanEventType,
} from '@/lib/capitalPressure/cardCopy';
import type { CapitalEvent, CapitalEventType, CapitalPressureResult } from '@/lib/capitalPressure/types';
import type { FastVerdict, FastVerdictKind, NewsClass, OfferingAbility } from '@/lib/fast/types';
import type { QuickScoreMetric, QuickScorecard } from '@/lib/forensic/quickScorecard/types';
import type {
  DilutionBrief,
  DilutionBriefInput,
  DilutionFinalCell,
  DilutionOverall,
  DilutionPillar,
  DilutionPillTone,
  DilutionSource,
  DilutionStatusPill,
  DilutionWeapon,
} from './types';

const WEAPON_PRIORITY: CapitalEventType[] = [
  'atm_program',
  'equity_line',
  'prospectus_supplement',
  'registered_direct',
  'warrant_exercise',
  'shelf_registration',
  'convertible_note',
  'private_placement',
];

const TRADE_GATE_LABEL: Record<FastVerdictKind, string> = {
  NO_TRADE: 'NO TRADE',
  WATCH: 'WATCH',
  REVIEW: 'REVIEW',
};

const NEWS_CATALYST_LABEL: Record<NewsClass, string> = {
  FATAL: 'Fatal / fluff headline',
  IDEAL: 'Ideal short-catalyst headline',
  NEUTRAL: 'Neutral headline',
  NONE: 'No new issuer catalyst',
};

export function formatDilutionAsOf(iso?: string | null): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function bandTone(band: QuickScoreMetric['band'] | undefined): DilutionPillTone {
  switch (band) {
    case 'extreme':
    case 'high':
      return 'risk';
    case 'elevated':
      return 'warn';
    case 'moderate':
      return 'info';
    case 'low':
      return 'ok';
    default:
      return 'muted';
  }
}

function overallFromOffering(offering?: QuickScoreMetric | null): DilutionOverall {
  const caption = 'Financing assessment — not the Fast Verdict trade gate';
  switch (offering?.band) {
    case 'extreme':
      return { letter: 'A', label: 'Strong support', tone: 'risk', caption };
    case 'high':
      return { letter: 'B', label: 'Elevated support', tone: 'warn', caption };
    case 'elevated':
      return { letter: 'C', label: 'Moderate support', tone: 'warn', caption };
    case 'moderate':
      return { letter: 'D', label: 'Limited support', tone: 'info', caption };
    case 'low':
      return { letter: 'E', label: 'Weak support', tone: 'ok', caption };
    default:
      return { letter: '—', label: 'Insufficient data', tone: 'muted', caption };
  }
}

function scoreText(metric?: QuickScoreMetric | null): string {
  if (!metric || metric.value == null) return '—';
  return `${metric.value}/10`;
}

function floatValue(input: DilutionBriefInput): number | null {
  const raw =
    input.fastVerdict?.fundamentals.float ??
    input.scanData?.floatShares ??
    input.shortCheck?.extracted?.float ??
    null;
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw;
}

function pickWeaponEvent(cp?: CapitalPressureResult | null): CapitalEvent | undefined {
  if (!cp?.events?.length) return undefined;
  const pinned = findPinnedEvent(cp.events, cp.reasons?.[0]);
  if (pinned && WEAPON_PRIORITY.includes(pinned.type)) return pinned;
  for (const type of WEAPON_PRIORITY) {
    const match = cp.events.find((e) => e.type === type && !e.isRetrospective);
    if (match) return match;
  }
  return pinned;
}

function buildPills(input: DilutionBriefInput): DilutionStatusPill[] {
  const pills: DilutionStatusPill[] = [];
  const cp = input.capitalPressure;
  const fv = input.fastVerdict;
  const qs = input.quickScorecard;
  const extracted = input.shortCheck?.extracted;

  const atmEvent = cp?.events?.find((e) => e.type === 'atm_program' && !e.isRetrospective);
  const shelfEvent = cp?.events?.find((e) => e.type === 'shelf_registration' && !e.isRetrospective);
  const dtAtm = (extracted?.atmShelfStatus ?? '').toLowerCase();
  const dtAtmActive = /atm|equity line|active/.test(dtAtm);

  if (atmEvent || fv?.dilution.atmDetected === true || dtAtmActive) {
    pills.push({
      id: 'atm',
      label: atmEvent ? 'ATM verified' : dtAtmActive ? 'ATM / shelf (DT)' : 'ATM detected',
      asOf: formatDilutionAsOf(atmEvent?.eventDate ?? atmEvent?.evidence?.filingDate ?? cp?.scannedThrough),
      tone: 'info',
    });
  } else if (shelfEvent || /s-1|s-3|shelf/.test(dtAtm)) {
    pills.push({
      id: 'shelf',
      label: 'Shelf on file',
      asOf: formatDilutionAsOf(shelfEvent?.eventDate ?? shelfEvent?.evidence?.filingDate ?? cp?.scannedThrough),
      tone: 'info',
    });
  }

  const overhang = cp?.events?.find((e) => e.isSellingShareholder || e.type === 'warrant_exercise');
  const issued30 = cp?.recentIssuance?.shares30d ?? 0;
  if (qs?.offeringTrap) {
    pills.push({
      id: 'trap',
      label: 'Offering trap',
      asOf: formatDilutionAsOf(cp?.scannedThrough ?? qs.asOf),
      tone: 'risk',
    });
  } else if (issued30 > 0) {
    pills.push({
      id: 'issuance',
      label: 'Recent issuance',
      asOf: formatDilutionAsOf(cp?.scannedThrough),
      tone: 'warn',
    });
  } else if (overhang) {
    pills.push({
      id: 'overhang',
      label: overhang.isSellingShareholder ? 'Resale overhang' : 'Warrant overhang',
      asOf: formatDilutionAsOf(overhang.eventDate ?? overhang.evidence?.filingDate),
      tone: 'warn',
    });
  }

  if (qs?.cashNeed.value != null && qs.cashNeed.value >= 7) {
    pills.push({
      id: 'cash',
      label: 'Cash need elevated',
      asOf: formatDilutionAsOf(cp?.sharesOutstanding?.asOf ?? qs.asOf),
      tone: 'risk',
    });
  } else if (fv?.fundamentals.runwayMonths != null && fv.fundamentals.runwayMonths < 6) {
    pills.push({
      id: 'cash',
      label: 'Short runway',
      asOf: formatDilutionAsOf(qs?.asOf),
      tone: 'warn',
    });
  }

  const newsClass = fv?.news.class;
  if (newsClass === 'NONE' || !newsClass) {
    pills.push({
      id: 'catalyst',
      label: 'No new issuer catalyst',
      asOf: formatDilutionAsOf(fv?.filings.today[0]?.filedAt),
      tone: 'warn',
    });
  } else if (newsClass === 'FATAL') {
    pills.push({
      id: 'catalyst',
      label: 'Fatal / fluff headline',
      tone: 'risk',
    });
  } else if (newsClass === 'IDEAL') {
    pills.push({
      id: 'catalyst',
      label: 'Ideal catalyst headline',
      tone: 'info',
    });
  }

  return pills.slice(0, 4);
}

function needRows(input: DilutionBriefInput): DilutionPillar['rows'] {
  const fv = input.fastVerdict;
  const qs = input.quickScorecard;
  const extracted = input.shortCheck?.extracted;
  const cp = input.capitalPressure;
  const rows: DilutionPillar['rows'] = [];

  const runway = fv?.fundamentals.runwayMonths ?? extracted?.cashRunway ?? null;
  if (runway != null) {
    rows.push({
      label: 'Approx. runway',
      value: `${runway.toFixed(1)} mo`,
      asOf: formatDilutionAsOf(qs?.asOf),
    });
  }
  if (extracted?.cashOnHand != null) {
    rows.push({
      label: 'Cash on hand',
      value: formatUsdShort(extracted.cashOnHand),
    });
  }
  if (extracted?.quarterlyBurnRate != null) {
    rows.push({
      label: 'Quarterly burn',
      value: formatUsdShort(extracted.quarterlyBurnRate),
    });
  }
  const cashReason = cp?.reasons.find((r) => /runway|cash/i.test(r.label));
  if (cashReason) {
    rows.push({
      label: 'Filing signal',
      value: cashReason.label,
      asOf: formatDilutionAsOf(cashReason.evidence?.filingDate),
    });
  }
  if (qs?.cashNeed.summary) {
    rows.push({ label: 'Cash-need source', value: qs.cashNeed.summary });
  }
  if (!rows.length) {
    rows.push({ label: 'Cash / runway', value: 'Not verified' });
  }
  return rows.slice(0, 5);
}

function abilityRows(input: DilutionBriefInput): DilutionPillar['rows'] {
  const fv = input.fastVerdict;
  const qs = input.quickScorecard;
  const cp = input.capitalPressure;
  const extracted = input.shortCheck?.extracted;
  const rows: DilutionPillar['rows'] = [];

  const ability = fv?.dilution.derivedOfferingAbility;
  if (ability) {
    rows.push({ label: 'Offering ability', value: ability });
  }
  if (fv?.dilution.atmDetected != null) {
    rows.push({
      label: 'ATM',
      value: fv.dilution.atmDetected ? 'Detected' : 'Not detected',
      asOf: formatDilutionAsOf(cp?.scannedThrough),
    });
  } else if (extracted?.atmShelfStatus) {
    rows.push({ label: 'DT ATM / shelf', value: extracted.atmShelfStatus });
  }
  if (cp?.capacity?.description) {
    rows.push({
      label: 'Capacity',
      value: cp.capacity.description,
      asOf: formatDilutionAsOf(cp.scannedThrough),
    });
  }
  const float = floatValue(input);
  if (float != null) {
    rows.push({ label: 'Trading float', value: formatSharesShort(float) });
  }
  if (fv?.dilution.capacityQuarters != null) {
    rows.push({
      label: 'Baby-shelf capacity',
      value: `${fv.dilution.capacityQuarters.toFixed(2)} qtrs`,
    });
  }
  const restriction = cp?.events.find((e) => e.isSellingShareholder || e.isCapacityOnly);
  if (restriction) {
    rows.push({
      label: 'Key restriction',
      value: restriction.isSellingShareholder ? 'Selling-shareholder / resale' : 'Capacity only — not issued',
      asOf: formatDilutionAsOf(restriction.eventDate),
    });
  }
  if (qs?.offering.summary && rows.length < 5) {
    rows.push({ label: 'Ability source', value: qs.offering.summary });
  }
  if (!rows.length) {
    rows.push({ label: 'Offering channel', value: 'Not verified' });
  }
  return rows.slice(0, 5);
}

function incentiveRows(input: DilutionBriefInput): DilutionPillar['rows'] {
  const fv = input.fastVerdict;
  const qs = input.quickScorecard;
  const extracted = input.shortCheck?.extracted;
  const rows: DilutionPillar['rows'] = [];

  if (fv?.news.class) {
    rows.push({
      label: 'News / catalyst',
      value: fv.news.headline
        ? `${NEWS_CATALYST_LABEL[fv.news.class]} — ${fv.news.headline}`
        : NEWS_CATALYST_LABEL[fv.news.class],
    });
  } else if (extracted?.recentNews) {
    rows.push({ label: 'DT news', value: extracted.recentNews });
  }

  const cash = qs?.cashNeed.value ?? null;
  rows.push({
    label: 'Reason to raise',
    value:
      cash != null && cash >= 6
        ? qs?.cashNeed.summary || 'Cash need is elevated on existing scores'
        : 'No acute cash-need score on file',
  });

  const runway = fv?.fundamentals.runwayMonths ?? extracted?.cashRunway ?? null;
  if (fv?.news.class === 'FATAL') {
    rows.push({ label: 'Reason to wait', value: 'Headline looks like fatal / fluff PR' });
  } else if (runway != null && runway >= 18) {
    rows.push({ label: 'Reason to wait', value: `Runway ~${runway.toFixed(1)} mo — not cash-starved on this screen` });
  } else if (fv?.news.class === 'NONE') {
    rows.push({ label: 'Reason to wait', value: 'No new issuer catalyst located' });
  }

  if (qs?.survivalPump.summary) {
    rows.push({ label: 'Survival-pump', value: qs.survivalPump.summary });
  }
  if (!rows.length) {
    rows.push({ label: 'Incentive window', value: 'Not verified' });
  }
  return rows.slice(0, 5);
}

function buildPillars(input: DilutionBriefInput): DilutionPillar[] {
  const qs = input.quickScorecard;
  return [
    {
      id: 'need',
      title: 'Need',
      question: 'Do they need money?',
      score: qs?.cashNeed.value ?? null,
      scoreLabel: scoreText(qs?.cashNeed),
      confidence: qs?.cashNeed.confidence,
      rows: needRows(input),
      bottomLine: qs?.cashNeed.summary || 'Cash need not verified from runway or filings.',
    },
    {
      id: 'ability',
      title: 'Ability',
      question: 'Can shares enter the market now?',
      score: qs?.offering.value ?? null,
      scoreLabel: scoreText(qs?.offering),
      confidence: qs?.offering.confidence,
      rows: abilityRows(input),
      bottomLine:
        (input.capitalPressure ? buildCapitalPressureHeadline(input.capitalPressure) : null) ||
        qs?.offering.summary ||
        'Offering ability not verified from filings or Fast Verdict.',
    },
    {
      id: 'incentive',
      title: 'Incentive',
      question: 'Is this a financing opportunity?',
      score: qs?.survivalPump.value ?? null,
      scoreLabel: scoreText(qs?.survivalPump),
      confidence: qs?.survivalPump.confidence,
      rows: incentiveRows(input),
      bottomLine:
        qs?.survivalPump.summary ||
        (input.fastVerdict?.news.class
          ? NEWS_CATALYST_LABEL[input.fastVerdict.news.class]
          : 'Catalyst / survival-pump window not verified.'),
    },
  ];
}

function buildWeapon(input: DilutionBriefInput): DilutionWeapon {
  const cp = input.capitalPressure;
  const fv = input.fastVerdict;
  const qs = input.quickScorecard;
  const event = pickWeaponEvent(cp);
  const scanned = formatDilutionAsOf(cp?.scannedThrough ?? event?.evidence?.filingDate ?? event?.eventDate);

  if (event) {
    const heroShares = event.potentialShares ?? event.sharesIssued;
    const heroUsd = event.grossProceedsUsd;
    const heroValue =
      heroShares != null
        ? formatSharesShort(heroShares)
        : heroUsd != null
          ? formatUsdShort(heroUsd)
          : cp?.capacity.potentialShares != null
            ? formatSharesShort(cp.capacity.potentialShares)
            : cp?.capacity.amountUsd != null
              ? formatUsdShort(cp.capacity.amountUsd)
              : 'On file';
    const heroLabel =
      event.potentialShares != null
        ? 'Potential shares'
        : event.sharesIssued != null
          ? 'Shares issued'
          : event.grossProceedsUsd != null
            ? 'Gross proceeds'
            : cp?.capacity.potentialShares != null
              ? 'Registered capacity'
              : 'Primary channel';
    const badge = event.isSellingShareholder
      ? 'Resale / selling shareholder'
      : event.isCapacityOnly
        ? 'Conditional / registered'
        : qs?.offeringTrap
          ? 'Active financing channel'
          : 'On file';
    const fallbackWhy =
      qs?.offering.summary || (cp ? buildCapitalPressureHeadline(cp) : event.title) || humanEventType(event.type);
    const rawWhy = (event.description || '').trim();
    const whyItMatters =
      rawWhy && !rawWhy.startsWith('…') && !rawWhy.startsWith('...') && rawWhy.length <= 220
        ? rawWhy
        : fallbackWhy;

    return {
      name: humanEventType(event.type),
      badge,
      heroLabel,
      heroValue,
      heroAsOf: formatDilutionAsOf(event.eventDate ?? event.evidence?.filingDate) ?? scanned,
      whyItMatters,
      caveat: cp?.unknowns[0] ?? (event.isCapacityOnly ? 'Capacity on file is not confirmed issuance.' : null),
    };
  }

  if (cp?.capacity && cp.capacity.status !== 'unknown') {
    return {
      name: cp.capacity.description || 'Documented capacity',
      badge: cp.capacity.status === 'reported' ? 'Verified from filings' : 'Partially verified',
      heroLabel: cp.capacity.potentialShares != null ? 'Registered capacity' : 'Capacity',
      heroValue:
        cp.capacity.potentialShares != null
          ? formatSharesShort(cp.capacity.potentialShares)
          : cp.capacity.amountUsd != null
            ? formatUsdShort(cp.capacity.amountUsd)
            : 'On file',
      heroAsOf: scanned,
      whyItMatters: qs?.offering.summary || cp.summary || 'Financing capacity noted in scanned filings.',
      caveat: cp.unknowns[0] ?? null,
    };
  }

  if (fv?.dilution.atmDetected) {
    return {
      name: fv.dilution.equityLineCounterparty
        ? `ATM / ${fv.dilution.equityLineCounterparty}`
        : 'ATM detected',
      badge: 'Fast Verdict signal',
      heroLabel: 'Baby-shelf capacity',
      heroValue:
        fv.dilution.capacityQuarters != null
          ? `${fv.dilution.capacityQuarters.toFixed(2)} qtrs`
          : fv.dilution.derivedOfferingAbility,
      whyItMatters: qs?.offering.summary || 'ATM flag from Fast Verdict — confirm against SEC capacity.',
      caveat: 'ATM detection is a screen signal, not a sale instruction.',
    };
  }

  return {
    name: 'Primary dilution route unclear',
    badge: 'Not verified',
    heroLabel: 'Offering ability',
    heroValue: fv?.dilution.derivedOfferingAbility ?? 'UNKNOWN',
    whyItMatters: qs?.offering.summary || 'No ATM, shelf, or warrant channel pinned from filings yet.',
    caveat: cp?.unavailableReason ?? 'Balances and unused capacity may be dated or missing.',
  };
}

function canDiluteToday(
  ability: OfferingAbility | undefined,
  fv: FastVerdict | null | undefined,
  cp: CapitalPressureResult | null | undefined
): DilutionFinalCell {
  const capacityKnown = cp?.capacity?.status === 'reported' || cp?.capacity?.status === 'partial';
  const atm = fv?.dilution.atmDetected === true || Boolean(cp?.events?.some((e) => e.type === 'atm_program'));
  const channel = atm ? 'ATM on file' : capacityKnown ? 'Documented financing capacity' : null;

  if (ability === 'LOW') {
    return {
      id: 'canDilute',
      label: 'Can dilute today',
      value: 'No',
      detail: 'Derived offering ability LOW',
      tone: 'ok',
    };
  }
  if (ability === 'MEDIUM' && (atm || capacityKnown)) {
    return {
      id: 'canDilute',
      label: 'Can dilute today',
      value: 'Conditional',
      detail: channel,
      tone: 'warn',
    };
  }
  if (atm || capacityKnown || ability === 'HIGH') {
    return {
      id: 'canDilute',
      label: 'Can dilute today',
      value: ability === 'HIGH' || atm || capacityKnown ? 'Yes' : 'Likely',
      detail: channel ?? (ability === 'HIGH' ? 'HIGH offering ability — capacity not fully verified' : 'Offering channel on file'),
      tone: 'risk',
    };
  }
  if (ability === 'MEDIUM') {
    return {
      id: 'canDilute',
      label: 'Can dilute today',
      value: 'Conditional',
      detail: 'MEDIUM offering ability — capacity not fully verified',
      tone: 'warn',
    };
  }
  return {
    id: 'canDilute',
    label: 'Can dilute today',
    value: 'Unknown',
    detail: 'Offering ability not derived',
    tone: 'muted',
  };
}

function buildFinalRead(input: DilutionBriefInput, weapon: DilutionWeapon): DilutionFinalCell[] {
  const fv = input.fastVerdict;
  const qs = input.quickScorecard;
  const cp = input.capitalPressure;
  const float = floatValue(input);
  const os = cp?.sharesOutstanding;

  const structureBits = [
    float != null ? `${formatSharesShort(float)} float` : null,
    os?.value != null ? `${formatSharesShort(os.value)} O/S` : null,
  ].filter(Boolean);

  return [
    canDiluteToday(fv?.dilution.derivedOfferingAbility, fv, cp),
    {
      id: 'weapon',
      label: 'Main weapon',
      value: weapon.name,
      detail: weapon.badge,
      tone: 'info',
    },
    {
      id: 'structure',
      label: 'Capital structure',
      value: structureBits.length ? structureBits.join(' · ') : 'Float / O/S not verified',
      detail: os?.asOf ? `O/S as of ${formatDilutionAsOf(os.asOf)}` : null,
      tone: 'muted',
    },
    {
      id: 'catalyst',
      label: 'Catalyst',
      value: fv?.news.class ? NEWS_CATALYST_LABEL[fv.news.class] : 'Unknown',
      detail: fv?.news.headline ?? null,
      tone:
        fv?.news.class === 'NONE'
          ? 'warn'
          : fv?.news.class === 'FATAL'
            ? 'risk'
            : fv?.news.class
              ? 'info'
              : 'muted',
    },
    {
      id: 'squeeze',
      label: 'Squeeze risk',
      value: qs?.squeeze.value != null ? `${qs.squeeze.value}/10 · ${qs.squeeze.band}` : 'Unknown',
      detail: qs?.squeeze.summary ?? null,
      tone: bandTone(qs?.squeeze.band),
    },
  ];
}

function buildTenSecondRead(
  input: DilutionBriefInput,
  pillars: DilutionPillar[],
  weapon: DilutionWeapon,
  overall: DilutionOverall
): string {
  const ticker = input.ticker.toUpperCase();
  if (input.shortCheck?.synopsis?.trim()) {
    const extra = [input.capitalPressure ? buildCapitalPressureHeadline(input.capitalPressure) : null, input.aiThesisLead]
      .filter(Boolean)
      .join(' ');
    return extra ? `${input.shortCheck.synopsis.trim()} ${extra}` : input.shortCheck.synopsis.trim();
  }

  const need = pillars.find((p) => p.id === 'need');
  const ability = pillars.find((p) => p.id === 'ability');
  const news = input.fastVerdict?.news;
  const parts = [
    `${ticker}: dilution support ${overall.letter} (${overall.label}).`,
    need ? `Need ${need.scoreLabel} — ${need.bottomLine}` : null,
    ability ? `Ability ${ability.scoreLabel} — ${ability.bottomLine}` : null,
    `Main weapon: ${weapon.name} (${weapon.heroValue}).`,
    news?.class ? `News: ${NEWS_CATALYST_LABEL[news.class]}${news.headline ? ` — ${news.headline}` : ''}.` : null,
  ].filter(Boolean) as string[];

  return parts.join(' ');
}

function pushSource(list: DilutionSource[], seen: Set<string>, src: DilutionSource) {
  if (!src.url || seen.has(src.url)) return;
  seen.add(src.url);
  list.push(src);
}

function buildSources(input: DilutionBriefInput): DilutionSource[] {
  const sources: DilutionSource[] = [];
  const seen = new Set<string>();
  const cp = input.capitalPressure;

  if (cp) {
    for (const reason of cp.reasons) {
      if (reason.evidence?.documentUrl) {
        pushSource(sources, seen, {
          label: `${reason.evidence.form} · ${reason.label}`,
          url: reason.evidence.documentUrl,
          asOf: formatDilutionAsOf(reason.evidence.filingDate),
        });
      }
    }
    for (const event of cp.events) {
      if (event.evidence?.documentUrl) {
        pushSource(sources, seen, {
          label: `${event.evidence.form} · ${event.title || humanEventType(event.type)}`,
          url: event.evidence.documentUrl,
          asOf: formatDilutionAsOf(event.evidence.filingDate ?? event.eventDate),
        });
      }
    }
    if (cp.edgarSearchUrl) {
      pushSource(sources, seen, {
        label: 'EDGAR company filings',
        url: cp.edgarSearchUrl,
        asOf: formatDilutionAsOf(cp.scannedThrough),
      });
    }
  }

  if (input.shortCheck?.secFilingUrl) {
    pushSource(sources, seen, {
      label: 'Capital Pressure evidence',
      url: input.shortCheck.secFilingUrl,
    });
  }

  for (const filing of input.fastVerdict?.filings.today ?? []) {
    // Fast filings have no URL — skip unless scan filings match by form/date
    const match = input.scanData?.filings?.find(
      (f) => f.form === filing.form && (f.filingDate === filing.filedAt || f.date === filing.filedAt)
    );
    const url = match?.documentUrl || match?.url || match?.link;
    if (url) {
      pushSource(sources, seen, {
        label: `${filing.form} · Fast Verdict today`,
        url,
        asOf: formatDilutionAsOf(filing.filedAt),
      });
    }
  }

  for (const filing of input.scanData?.filings ?? []) {
    const url = filing.documentUrl || filing.url || filing.link;
    if (!url) continue;
    pushSource(sources, seen, {
      label: filing.form ? `SEC ${filing.form}` : 'SEC filing',
      url,
      asOf: formatDilutionAsOf(filing.filingDate ?? filing.date),
    });
  }

  return sources.slice(0, 12);
}

export function buildDilutionBrief(input: DilutionBriefInput): DilutionBrief | null {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) return null;
  if (!input.fastVerdict && !input.quickScorecard && !input.capitalPressure && !input.shortCheck) {
    return null;
  }

  const pillars = buildPillars(input);
  const weapon = buildWeapon(input);
  const overall = overallFromOffering(input.quickScorecard?.offering);
  const fv = input.fastVerdict;

  return {
    ticker,
    session: fv?.session ?? null,
    tradeGate: fv
      ? {
          verdict: fv.verdict,
          label: TRADE_GATE_LABEL[fv.verdict],
          reason: fv.reason,
        }
      : null,
    pills: buildPills(input),
    tenSecondRead: buildTenSecondRead(input, pillars, weapon, overall),
    pillars,
    weapon,
    finalRead: buildFinalRead(input, weapon),
    overall,
    sources: buildSources(input),
  };
}
