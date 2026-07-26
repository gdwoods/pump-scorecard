// lib/wireNews/parseRss.ts
import {
  extractTickersFromCategories,
  extractTickersFromText,
} from './extractTickers';
import type { WireNewsItem } from './types';

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s: string): string {
  return decodeXmlEntities(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContents(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push(decodeXmlEntities(m[1]).trim());
  }
  return out;
}

function firstTag(block: string, tag: string): string {
  return tagContents(block, tag)[0] ?? '';
}

export function parseRssItems(xml: string, source: string): WireNewsItem[] {
  const items: WireNewsItem[] = [];
  const itemBlocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];

  for (const m of itemBlocks) {
    const block = m[1];
    const title = stripHtml(firstTag(block, 'title'));
    if (!title) continue;

    const link = stripHtml(firstTag(block, 'link') || firstTag(block, 'guid'));
    const description = stripHtml(firstTag(block, 'description'));
    const pubDateRaw = firstTag(block, 'pubDate') || firstTag(block, 'dc:date');
    let date = new Date().toISOString();
    if (pubDateRaw) {
      const d = new Date(pubDateRaw);
      if (!Number.isNaN(d.getTime())) date = d.toISOString();
    }

    const categories = tagContents(block, 'category').map(stripHtml);
    const fromCats = extractTickersFromCategories(categories);
    const fromText = extractTickersFromText(`${title} ${description}`);
    const tickers = [...new Set([...fromCats, ...fromText])];

    if (tickers.length === 0) continue;

    items.push({
      headline: title,
      date,
      source,
      url: link || '#',
      tickers,
    });
  }

  return items;
}
