jest.mock('next/cache', () => {
  const store = new Map<string, unknown>();
  (globalThis as { __tickerChangeDurable?: Map<string, unknown> }).__tickerChangeDurable = store;
  return {
    unstable_cache: (fn: (symbol: string) => Promise<unknown>) => async (symbol: string) => {
      const map = (globalThis as { __tickerChangeDurable?: Map<string, unknown> })
        .__tickerChangeDurable;
      if (map?.has(symbol)) return map.get(symbol);
      const value = await fn(symbol);
      map?.set(symbol, value);
      return value;
    },
  };
});

import { buildFastVerdict } from '../lib/fast/evaluate';
import { enrichFastVerdictFromScan } from '../lib/fast/enrichFromScan';
import { formatFastVerdictText } from '../lib/fast/formatText';
import type { Tier2Bundle } from '../lib/fast/fetchTier2';
import {
  appendTickerChangeFlag,
  fetchTickerChanges,
  formatTickerChangeSummary,
  parseAmbiguousTickerLineage,
  parseTickerChangesPayload,
  resetTickerChangeCacheForTests,
  tickerChangeFlag,
} from '../lib/fast/fetchTickerChanges';
import { fastVerdictToPromptSlice } from '../lib/ai/fastVerdictPrompt';
import { tickerChangesFromEvents } from '../lib/fast/tickerChangeStore';

const cgixResponse = {
  status: 'success',
  count: 1,
  results: [
    {
      query_ticker: 'CGIX',
      has_changes: true,
      current_ticker: 'VYNT',
      history: [
        { old_ticker: 'CGIX', new_ticker: 'VYNT', effective_date: '2021-03-31' },
      ],
      warnings: [],
    },
  ],
};

const KEY_ENV_VARS = [
  'ASKEDGAR_API_KEY',
  'ASK_EDGAR_API_KEY',
  'ASKEDGAR_KEY',
  'ASK_EDGAR_KEY',
] as const;

function skipBundle(
  tickerChanges: Tier2Bundle['tickerChanges']
): Tier2Bundle {
  const skip = { ok: false as const, error: 'skip' };
  return {
    snapshot: skip,
    bars: skip,
    fundamentals: skip,
    filings: skip,
    borrow: skip,
    news: skip,
    droppiness: skip,
    burn: skip,
    nasdaq: skip,
    regSho: skip,
    tickerChanges,
    dtCash: skip,
  };
}

const SUPABASE_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

describe('stored ticker changes', () => {
  it('keeps every event and leaves the current symbol unset when one day has two destinations', () => {
    const parsed = tickerChangesFromEvents('JAN', [
      { old_ticker: 'JAN', new_ticker: 'AIFC', effective_date: '2024-07-15' },
      { old_ticker: 'ALTS', new_ticker: 'JAN', effective_date: '2024-07-15' },
    ]);
    expect(parsed?.status).toBe('changed');
    expect(parsed?.currentTicker).toBeNull();
    expect(parsed?.warnings).toEqual(['competing_destinations']);
    expect(parsed?.history).toHaveLength(2);
  });
});

describe('AskEdgar ticker changes', () => {
  const savedSupabase = new Map<string, string | undefined>();

  beforeEach(() => {
    resetTickerChangeCacheForTests();
    (globalThis as { __tickerChangeDurable?: Map<string, unknown> }).__tickerChangeDurable?.clear();
    for (const name of SUPABASE_ENV) {
      savedSupabase.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of SUPABASE_ENV) {
      const value = savedSupabase.get(name);
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('parses a former symbol into a dated change', () => {
    const parsed = parseTickerChangesPayload(cgixResponse, 'cgix');
    expect(parsed.status).toBe('changed');
    expect(parsed.queryTicker).toBe('CGIX');
    expect(parsed.currentTicker).toBe('VYNT');
    expect(parsed.history).toEqual([
      { oldTicker: 'CGIX', newTicker: 'VYNT', effectiveDate: '2021-03-31' },
    ]);
    expect(formatTickerChangeSummary(parsed)).toBe(
      'now VYNT; CGIX -> VYNT (2021-03-31)'
    );
    expect(tickerChangeFlag(parsed)).toBe(
      'Past ticker change — now VYNT; CGIX -> VYNT (2021-03-31)'
    );
  });

  it('does not flag a ticker with no recorded change', () => {
    const parsed = parseTickerChangesPayload(
      {
        status: 'success',
        count: 1,
        results: [
          {
            query_ticker: 'AAPL',
            has_changes: false,
            current_ticker: null,
            history: [],
            warnings: [],
          },
        ],
      },
      'AAPL'
    );
    expect(parsed.status).toBe('none');
    expect(tickerChangeFlag(parsed)).toBeNull();
    expect(appendTickerChangeFlag(['other'], parsed)).toEqual(['other']);
    expect(formatTickerChangeSummary(parsed)).toBe('no recorded changes');
  });

  it('keeps warning codes on a real history and does not duplicate the flag', () => {
    const parsed = parseTickerChangesPayload(
      {
        status: 'success',
        count: 1,
        results: [
          {
            query_ticker: 'BBB',
            has_changes: true,
            current_ticker: 'BBB',
            history: [
              { old_ticker: 'AAA', new_ticker: 'BBB', effective_date: '2019-01-02' },
              { old_ticker: 'BBB', new_ticker: 'CCC', effective_date: '2020-06-01' },
              { old_ticker: 'CCC', new_ticker: 'BBB', effective_date: '2024-04-15' },
            ],
            warnings: ['reused_symbol'],
          },
        ],
      },
      'BBB'
    );
    expect(formatTickerChangeSummary(parsed)).toBe(
      'AAA -> BBB (2019-01-02); BBB -> CCC (2020-06-01); CCC -> BBB (2024-04-15) · reused symbol (most recent history)'
    );
    const flagged = appendTickerChangeFlag(
      appendTickerChangeFlag([], parsed),
      parsed
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].startsWith('Past ticker change —')).toBe(true);
  });

  it('caps a long chain at the four most recent events', () => {
    const history = ['2018-01-01', '2019-01-01', '2020-01-01', '2021-01-01', '2022-01-01'].map(
      (effective_date, index) => ({
        old_ticker: `T${index}`,
        new_ticker: `T${index + 1}`,
        effective_date,
      })
    );
    const parsed = parseTickerChangesPayload(
      {
        status: 'success',
        count: 1,
        results: [
          {
            query_ticker: 'T5',
            has_changes: true,
            current_ticker: 'T5',
            history,
            warnings: [],
          },
        ],
      },
      'T5'
    );
    expect(formatTickerChangeSummary(parsed)).toBe(
      '+1 earlier; T1 -> T2 (2019-01-01); T2 -> T3 (2020-01-01); T3 -> T4 (2021-01-01); T4 -> T5 (2022-01-01)'
    );
  });

  it('flags an ambiguous lineage without inventing a current ticker', () => {
    const parsed = parseAmbiguousTickerLineage(
      {
        status: 'error',
        error: {
          code: 'ambiguous_ticker_lineage',
          message: 'Ticker history is too long to be reliable.',
          details: {
            query_ticker: 'BBB',
            reason: 'max_hops_exceeded',
            tickers: ['AAA', 'BBB', 'CCC'],
          },
        },
      },
      'BBB'
    );
    expect(parsed.status).toBe('ambiguous');
    expect(parsed.currentTicker).toBeNull();
    expect(tickerChangeFlag(parsed)).toBe(
      'Ticker history unreliable — more than 12 linked changes (AAA, BBB, CCC)'
    );
    expect(formatTickerChangeSummary(parsed)).toBe('history unreliable (AAA, BBB, CCC)');
  });

  it('rejects a payload that does not say whether a change exists', () => {
    expect(() => parseTickerChangesPayload({ results: [{}] }, 'CGIX')).toThrow(
      /unexpected payload/
    );
  });

  it('adds the flag on the fast verdict and keeps it after scan enrichment', () => {
    const parsed = parseTickerChangesPayload(cgixResponse, 'CGIX');
    const built = buildFastVerdict(
      'CGIX',
      skipBundle({ ok: true, value: parsed }),
      Date.now()
    );
    expect(built.tickerChanges?.status).toBe('changed');
    expect(built.flags.some((flag) => flag.startsWith('Past ticker change'))).toBe(true);
    expect(built.reason).toBe('W1:dataCompleteness');
    expect(built.verdict).toBe('WATCH');

    const text = formatFastVerdictText(built);
    expect(text).toContain('Ticker  now VYNT; CGIX -> VYNT (2021-03-31)');
    expect(text).toContain('Past ticker change — now VYNT; CGIX -> VYNT (2021-03-31)');

    const enriched = enrichFastVerdictFromScan(built, {
      floatShares: 5e6,
      marketCap: 10e6,
    });
    expect(enriched.flags.some((flag) => flag.startsWith('Past ticker change'))).toBe(true);
    expect(enriched.reason ?? '').not.toMatch(/ticker/i);

    expect(fastVerdictToPromptSlice(built).tickerChanges).toBe(
      'Past ticker change — now VYNT; CGIX -> VYNT (2021-03-31)'
    );
  });

  it('does not call AskEdgar when the symbol is longer than the endpoint allows', async () => {
    const fetchMock = jest.fn();
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await fetchTickerChanges('TOOLONG');
      expect(result.status).toBe('unavailable');
      expect(result.reason).toBe('invalid_ticker');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });

  it('reports a missing key without calling AskEdgar', async () => {
    const saved = KEY_ENV_VARS.map((name) => [name, process.env[name]] as const);
    for (const name of KEY_ENV_VARS) delete process.env[name];
    const fetchMock = jest.fn();
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await fetchTickerChanges('ZZKEY');
      expect(result).toMatchObject({ status: 'unavailable', reason: 'no_api_key' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(formatTickerChangeSummary(result)).toBe('AskEdgar key not set');
    } finally {
      global.fetch = original;
      for (const [name, value] of saved) {
        if (value == null) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('maps a 409 into the unreliable-history flag', async () => {
    const savedKey = process.env.ASKEDGAR_API_KEY;
    process.env.ASKEDGAR_API_KEY = 'test-key';
    const original = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        status: 'error',
        error: {
          code: 'ambiguous_ticker_lineage',
          message: 'Ticker history is too long to be reliable.',
          details: {
            query_ticker: 'AMBIG',
            reason: 'max_hops_exceeded',
            tickers: ['OLD', 'AMBIG'],
          },
        },
      }),
    })) as unknown as typeof fetch;
    try {
      const result = await fetchTickerChanges('AMBIG');
      expect(result.status).toBe('ambiguous');
      expect(tickerChangeFlag(result)).toContain('OLD, AMBIG');
      const called = (global.fetch as jest.Mock).mock.calls[0];
      expect(String(called[0])).toBe(
        'https://eapi.askedgar.io/v1/ticker-changes?ticker=AMBIG'
      );
      expect(called[1].headers['API-KEY']).toBe('test-key');
    } finally {
      global.fetch = original;
      if (savedKey == null) delete process.env.ASKEDGAR_API_KEY;
      else process.env.ASKEDGAR_API_KEY = savedKey;
    }
  });

  it('reuses a cached history instead of calling AskEdgar again', async () => {
    const savedKey = process.env.ASKEDGAR_API_KEY;
    process.env.ASKEDGAR_API_KEY = 'test-key';
    const original = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => cgixResponse,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const first = await fetchTickerChanges('CACHE');
      expect(first.status).toBe('changed');
      resetTickerChangeCacheForTests();
      const second = await fetchTickerChanges('CACHE');
      expect(second.status).toBe('changed');
      expect(second.currentTicker).toBe('VYNT');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = original;
      if (savedKey == null) delete process.env.ASKEDGAR_API_KEY;
      else process.env.ASKEDGAR_API_KEY = savedKey;
    }
  });

  it('reads a stored symbol change without calling AskEdgar', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-test';
    const original = global.fetch;
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).includes('/rest/v1/ticker_change_events')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              old_ticker: 'RVIV',
              new_ticker: 'AXIL',
              effective_date: '2024-01-16',
              security_id: '0001718500',
            },
          ],
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await fetchTickerChanges('AXIL');
      expect(result.status).toBe('changed');
      expect(result.history).toEqual([
        { oldTicker: 'RVIV', newTicker: 'AXIL', effectiveDate: '2024-01-16' },
      ]);
      expect(fetchMock.mock.calls.every((call) => String(call[0]).includes('supabase.co'))).toBe(
        true
      );
    } finally {
      global.fetch = original;
    }
  });

  it('treats a recent empty lookup as no recorded change', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-test';
    const original = global.fetch;
    global.fetch = jest.fn(async (url: string) => {
      const href = String(url);
      if (href.includes('ticker_change_events')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (href.includes('ticker_change_lookups')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ has_changes: false, checked_at: new Date().toISOString() }],
        };
      }
      throw new Error(`unexpected fetch ${href}`);
    }) as unknown as typeof fetch;
    try {
      const result = await fetchTickerChanges('AAPL');
      expect(result).toMatchObject({ status: 'none', queryTicker: 'AAPL' });
      expect(tickerChangeFlag(result)).toBeNull();
    } finally {
      global.fetch = original;
    }
  });

  it('stops calling AskEdgar after credits are rejected', async () => {
    const savedKey = process.env.ASKEDGAR_API_KEY;
    process.env.ASKEDGAR_API_KEY = 'test-key';
    const original = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({ status: 'error' }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const first = await fetchTickerChanges('CRED1');
      const second = await fetchTickerChanges('CRED2');
      expect(first.reason).toBe('credits');
      expect(second.reason).toBe('credits');
      expect(formatTickerChangeSummary(second)).toBe('AskEdgar credits too low');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = original;
      if (savedKey == null) delete process.env.ASKEDGAR_API_KEY;
      else process.env.ASKEDGAR_API_KEY = savedKey;
    }
  });
});
