// scripts/verify-wire-news.ts
import { extractTickersFromCategories, extractTickersFromText } from '../lib/wireNews/extractTickers';
import { parseRssItems } from '../lib/wireNews/parseRss';
import { mergeTickerNews } from '../lib/wireNews/kv';
import { WIRE_FEEDS } from '../lib/wireNews/feeds';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

assert(
  extractTickersFromCategories(['Nasdaq:EDHL', 'NYSE:XFLT']).includes('EDHL'),
  'category EDHL'
);
assert(
  extractTickersFromCategories(['Nasdaq:EDHL']).includes('EDHL') &&
    extractTickersFromText('(NASDAQ: MVST) announced').includes('MVST'),
  'text MVST'
);
assert(!extractTickersFromText('(FDA) approval').includes('FDA'), 'blocklist FDA');

const sampleXml = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>Acme Announces Offering</title>
  <link>https://example.com/1</link>
  <category domain="https://www.globenewswire.com/rss/stock">Nasdaq:ACME</category>
  <description><![CDATA[<p>Acme (NASDAQ: ACME) prices a deal.</p>]]></description>
  <pubDate>Sun, 26 Jul 2026 14:00:00 GMT</pubDate>
</item>
</channel></rss>`;

const parsed = parseRssItems(sampleXml, 'GlobeNewswire');
assert(parsed.length === 1, 'parsed 1 item');
assert(parsed[0].tickers.includes('ACME'), 'parsed ticker ACME');

const merged = mergeTickerNews(
  null,
  [{ headline: 'H1', date: '2026-07-26T14:00:00.000Z', source: 'GlobeNewswire', url: 'u1' }],
  ['GlobeNewswire']
);
assert(merged.items.length === 1 && merged.sources.includes('GlobeNewswire'), 'merge');

// Live feed smoke (network)
async function live() {
  for (const feed of WIRE_FEEDS.slice(0, 2)) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'ShortCheck/1.0 verify' },
      });
      assert(res.ok, `live ${feed.id} status ${res.status}`);
      const xml = await res.text();
      const items = parseRssItems(xml, feed.source);
      console.log(`ok: live ${feed.id} parsed ${items.length} tickered items`);
    } catch (err) {
      console.error('FAIL: live', feed.id, err);
      failed++;
    }
  }
}

live().then(() => {
  console.log(failed === 0 ? '\nALL WIRE NEWS ASSERTIONS PASSED' : `\n${failed} FAILURES`);
  process.exit(failed === 0 ? 0 : 1);
});
