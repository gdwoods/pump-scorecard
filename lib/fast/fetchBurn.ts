// lib/fast/fetchBurn.ts — Edge-safe quarterly burn + runway from SEC filers.

export type BurnRunwayData = {
  quarterlyBurn: number | null;
  runwayMonths: number | null;
  positiveFcf: boolean;
  cashUsd: number | null;
  source: 'polygon' | 'finnhub' | null;
};

function runwayFromCash(cashUsd: number | null, quarterlyBurn: number | null): number | null {
  if (cashUsd == null || quarterlyBurn == null || quarterlyBurn <= 0) return null;
  const monthlyBurn = quarterlyBurn / 3;
  if (monthlyBurn <= 0) return null;
  return (cashUsd / monthlyBurn);
}

function fromOperatingCashFlow(
  ocf: number | null,
  cashUsd: number | null,
  source: 'polygon' | 'finnhub'
): BurnRunwayData {
  if (ocf == null) {
    return { quarterlyBurn: null, runwayMonths: null, positiveFcf: false, cashUsd, source };
  }
  if (ocf >= 0) {
    return { quarterlyBurn: null, runwayMonths: null, positiveFcf: true, cashUsd, source };
  }
  const quarterlyBurn = Math.abs(ocf);
  return {
    quarterlyBurn,
    runwayMonths: runwayFromCash(cashUsd, quarterlyBurn),
    positiveFcf: false,
    cashUsd,
    source,
  };
}

async function fetchPolygonBurn(ticker: string): Promise<BurnRunwayData | null> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;

  const url = `https://api.polygon.io/vX/reference/financials?ticker=${encodeURIComponent(
    ticker
  )}&timeframe=quarterly&limit=1&order=desc&sort=period_of_report_date&apiKey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;

  const json = await res.json();
  const row = json?.results?.[0];
  if (!row) return null;

  const fin = row.financials ?? row;
  const cf = fin.cash_flow_statement ?? fin.cash_flow ?? {};
  const bs = fin.balance_sheet ?? fin.balance ?? {};

  const ocf =
    cf.net_cash_flow_from_operating_activities?.value ??
    cf.operating_cash_flow?.value ??
    cf.net_cash_flow?.value ??
    null;

  const cash =
    bs.cash_and_cash_equivalents?.value ??
    bs.cash_and_equivalents?.value ??
    bs.cash?.value ??
    null;

  if (typeof ocf !== 'number' && typeof cash !== 'number') return null;
  return fromOperatingCashFlow(
    typeof ocf === 'number' ? ocf : null,
    typeof cash === 'number' ? cash : null,
    'polygon'
  );
}

async function fetchFinnhubBurn(ticker: string): Promise<BurnRunwayData | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;

  const [cfRes, bsRes] = await Promise.all([
    fetch(
      `https://finnhub.io/api/v1/stock/financials?symbol=${encodeURIComponent(
        ticker
      )}&statement=cf&freq=quarterly&token=${token}`,
      { cache: 'no-store' }
    ),
    fetch(
      `https://finnhub.io/api/v1/stock/financials?symbol=${encodeURIComponent(
        ticker
      )}&statement=bs&freq=quarterly&token=${token}`,
      { cache: 'no-store' }
    ),
  ]);

  if (!cfRes.ok) return null;
  const cfJson = await cfRes.json();
  const quarters = (cfJson?.financials ?? cfJson?.data ?? []) as Array<Record<string, number>>;
  if (!quarters.length) return null;

  const latest = quarters[0];
  const ocf =
    latest.netOperatingCashFlow ??
    latest.operatingCashFlow ??
    latest.netCashFromOperations ??
    null;

  let cashUsd: number | null = null;
  if (bsRes.ok) {
    const bsJson = await bsRes.json();
    const bsRows = (bsJson?.financials ?? bsJson?.data ?? []) as Array<Record<string, number>>;
    if (bsRows.length) {
      cashUsd =
        bsRows[0].cashAndCashEquivalents ??
        bsRows[0].cashShortTermInvestments ??
        bsRows[0].cash ??
        null;
    }
  }

  if (typeof ocf !== 'number') return null;
  return fromOperatingCashFlow(ocf, cashUsd, 'finnhub');
}

export async function fetchBurnRunway(ticker: string): Promise<BurnRunwayData> {
  const empty: BurnRunwayData = {
    quarterlyBurn: null,
    runwayMonths: null,
    positiveFcf: false,
    cashUsd: null,
    source: null,
  };

  try {
    const polygon = await fetchPolygonBurn(ticker);
    if (polygon?.quarterlyBurn != null || polygon?.positiveFcf) return polygon;
  } catch {
    // fall through
  }

  try {
    const finnhub = await fetchFinnhubBurn(ticker);
    if (finnhub) return finnhub;
  } catch {
    // fall through
  }

  return empty;
}
