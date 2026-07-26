// lib/droppiness/compute.ts
// Bayesian V2 droppiness over 8h buckets from Polygon 1-minute bars.
// Shared by /api/scan and the nightly droppiness cron.

import type {
  DroppinessComputeResult,
  DroppinessDetail,
  IntradayCandle,
} from './types';

type PolygonBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

const EIGHTEEN_MONTHS_MS = 1000 * 60 * 60 * 24 * 547;
const BUCKET_MS = 1000 * 60 * 60 * 8;

async function fetchOneMinuteBars(ticker: string): Promise<PolygonBar[]> {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) return [];

  const endDate = new Date();
  const startDate = new Date(Date.now() - EIGHTEEN_MONTHS_MS);
  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);

  const oneMinBars: PolygonBar[] = [];
  let url: string | null = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${startDateStr}/${endDateStr}?limit=50000&apiKey=${polygonKey}`;
  let pageCount = 0;

  while (url && pageCount < 10) {
    const res = await fetch(url);
    if (!res.ok) break;
    const json: { results?: PolygonBar[]; next_url?: string } = await res.json();
    if (json.results?.length) {
      oneMinBars.push(
        ...json.results.map((c) => ({
          t: c.t,
          o: c.o,
          h: c.h,
          l: c.l,
          c: c.c,
          v: c.v,
        }))
      );
    }
    url = json.next_url ? `${json.next_url}&apiKey=${polygonKey}` : null;
    pageCount++;
  }

  return oneMinBars;
}

function aggregateEightHourBuckets(oneMinBars: PolygonBar[]): IntradayCandle[] {
  const candles: IntradayCandle[] = [];
  let bucket: IntradayCandle | null = null;

  for (const bar of oneMinBars) {
    const barTime = new Date(bar.t);
    const bucketTime = Math.floor(barTime.getTime() / BUCKET_MS) * BUCKET_MS;

    if (!bucket || bucket.bucketTime !== bucketTime) {
      if (bucket) candles.push(bucket);
      bucket = {
        bucketTime,
        date: new Date(bucketTime),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      };
    } else {
      bucket.high = Math.max(bucket.high, bar.h);
      bucket.low = Math.min(bucket.low, bar.l);
      bucket.close = bar.c;
      bucket.volume += bar.v;
    }
  }
  if (bucket) candles.push(bucket);
  return candles;
}

function scoreFromCandles(candles: IntradayCandle[]): Omit<DroppinessComputeResult, 'intraday'> {
  let spikeCount = 0;
  const spikesForV2: Array<{ ageDays: number; retraced: boolean }> = [];
  const nowMs = Date.now();
  const detail: DroppinessDetail[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev.close || !cur.close || !cur.high || !cur.open) continue;

    const spikePctBetweenBuckets = (cur.high - prev.close) / prev.close;
    const spikePctWithinBucket = (cur.high - cur.open) / cur.open;
    const spikePct = Math.max(spikePctBetweenBuckets, spikePctWithinBucket);

    if (spikePct > 0.2) {
      spikeCount++;
      let retraced = false;
      if ((cur.high - cur.close) / cur.high > 0.1) retraced = true;
      if (!retraced && candles[i + 1] && candles[i + 1].close < cur.close * 0.9) {
        retraced = true;
      }

      detail.push({
        date: cur.date.toISOString(),
        spikePct: +(spikePct * 100).toFixed(1),
        retraced,
      });

      const ageDays = Math.max(0, (nowMs - cur.date.getTime()) / (1000 * 60 * 60 * 24));
      spikesForV2.push({ ageDays, retraced });
    }
  }

  const tauDays = 365;
  const priorStrength = 3;
  const priorMean = 0.5;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of spikesForV2) {
    const w = Math.exp(-s.ageDays / tauDays);
    weightedSum += w * (s.retraced ? 1 : 0);
    weightTotal += w;
  }

  const nEff = weightTotal;
  const pHat = weightTotal > 0 ? weightedSum / weightTotal : 0.5;
  const pAdj = (nEff * pHat + priorStrength * priorMean) / (nEff + priorStrength);
  let scoreV2 = Math.round(Math.max(0, Math.min(1, pAdj)) * 100);
  if (spikeCount < 2) scoreV2 = Math.min(scoreV2, 85);

  return { score: scoreV2, spikeCount, nEff, detail };
}

/** Full Polygon → Bayesian V2 droppiness. Node-only (heavy fetch). */
export async function computeDroppiness(
  ticker: string
): Promise<DroppinessComputeResult> {
  const upper = ticker.toUpperCase();
  try {
    const oneMinBars = await fetchOneMinuteBars(upper);
    const candles = aggregateEightHourBuckets(oneMinBars);
    const scored = scoreFromCandles(candles);
    return { ...scored, intraday: candles };
  } catch (err) {
    console.error('[droppiness] compute failed', upper, err);
    return { score: 0, spikeCount: 0, nEff: 0, detail: [], intraday: [] };
  }
}
