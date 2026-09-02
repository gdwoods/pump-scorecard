/**
 * Parse SEC Form 4 and Form 144 XML into structured insider transactions.
 * Form 144 = filed intent to sell (earlier signal than Form 4 completion).
 */

export type ParsedInsiderRow = {
  date: string;
  transactionType: 'buy' | 'sell' | 'other' | 'intent_to_sell';
  shares: number;
  pricePerShare: number;
  totalValue: number;
  insiderName: string;
  insiderTitle: string;
  formType: string;
  transactionCode?: string;
};

const SEC_HEADERS = {
  'User-Agent': 'Short-Check App admin@short-check.com',
  Accept: 'application/xml, text/xml, */*',
};

function tag(xml: string, name: string): string | undefined {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = xml.match(re);
  return m?.[1]?.trim();
}

function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function num(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function mapTransactionCode(code: string | undefined): 'buy' | 'sell' | 'other' {
  const c = (code || '').toUpperCase();
  if (c === 'P' || c === 'A') return 'buy';
  if (c === 'S' || c === 'D' || c === 'F') return 'sell';
  return 'other';
}

function ownerBlock(xml: string): { name: string; title: string } {
  const ownerXml =
    xml.match(/<reportingOwner[\s\S]*?<\/reportingOwner>/i)?.[0] ||
    xml.match(/<reportingOwnerId[\s\S]*?<\/reportingOwnerId>/i)?.[0] ||
    xml;
  const name =
    tag(ownerXml, 'rptOwnerName') ||
    tag(ownerXml, 'reportingOwnerName') ||
    'Unknown insider';
  const title =
    tag(ownerXml, 'officerTitle') ||
    tag(ownerXml, 'rptOwnerTitle') ||
    tag(ownerXml, 'otherText') ||
    'Insider';
  return { name, title };
}

function parseNonDerivativeTransactions(
  xml: string,
  owner: { name: string; title: string },
  formType: string,
  fallbackDate: string
): ParsedInsiderRow[] {
  const rows: ParsedInsiderRow[] = [];
  const blocks = tags(xml, 'nonDerivativeTransaction');
  for (const block of blocks) {
    const date =
      tag(block, 'transactionDate')?.replace(/<value>([^<]+)<\/value>/i, '$1') ||
      tag(block, 'transactionDate') ||
      fallbackDate;
    const sharesRaw =
      tag(block, 'transactionShares')?.match(/<value>([^<]+)<\/value>/i)?.[1] ||
      tag(block, 'transactionShares');
    const priceRaw =
      tag(block, 'transactionPricePerShare')?.match(/<value>([^<]+)<\/value>/i)?.[1] ||
      tag(block, 'transactionPricePerShare');
    const code =
      tag(block, 'transactionCode') ||
      tag(block, 'transactionAcquiredDisposedCode')?.match(/<value>([^<]+)<\/value>/i)?.[1] ||
      tag(block, 'transactionAcquiredDisposedCode');
    const adCode = (code || '').toUpperCase();
    const shares = num(sharesRaw);
    const price = num(priceRaw);
    const txType =
      adCode === 'A' ? 'buy' : adCode === 'D' ? 'sell' : mapTransactionCode(adCode);
    rows.push({
      date: date.slice(0, 10),
      transactionType: txType,
      shares,
      pricePerShare: price,
      totalValue: shares * price,
      insiderName: owner.name,
      insiderTitle: owner.title,
      formType,
      transactionCode: code,
    });
  }
  return rows;
}

/** Parse Form 4 ownership XML (non-derivative transactions). */
export function parseForm4Xml(xml: string, filingDate: string): ParsedInsiderRow[] {
  const owner = ownerBlock(xml);
  const fromNonDeriv = parseNonDerivativeTransactions(xml, owner, '4', filingDate);
  if (fromNonDeriv.length > 0) return fromNonDeriv;

  // Fallback: single-transaction flat tags
  const date = tag(xml, 'transactionDate') || filingDate;
  const shares = num(tag(xml, 'transactionShares'));
  const price = num(tag(xml, 'transactionPricePerShare'));
  const code = tag(xml, 'transactionCode');
  if (shares <= 0 && price <= 0) return [];
  return [
    {
      date: date.slice(0, 10),
      transactionType: mapTransactionCode(code),
      shares,
      pricePerShare: price,
      totalValue: shares * price,
      insiderName: owner.name,
      insiderTitle: owner.title,
      formType: '4',
      transactionCode: code,
    },
  ];
}

/** Parse Form 144 notice of proposed sale. */
export function parseForm144Xml(xml: string, filingDate: string): ParsedInsiderRow[] {
  const owner = ownerBlock(xml);
  const date = tag(xml, 'approxSaleDate') || tag(xml, 'transactionDate') || filingDate;
  const shares =
    num(tag(xml, 'noOfUnitsSold')) ||
    num(tag(xml, 'securitiesSold')) ||
    num(tag(xml, 'amountOfSecuritiesSold'));
  const price =
    num(tag(xml, 'marketPrice')) ||
    num(tag(xml, 'pricePerShare')) ||
    num(tag(xml, 'aggregateMarketValue'));
  const rows: ParsedInsiderRow[] = [];
  if (shares > 0 || price > 0) {
    rows.push({
      date: date.slice(0, 10),
      transactionType: 'intent_to_sell',
      shares,
      pricePerShare: price,
      totalValue: shares * price,
      insiderName: owner.name,
      insiderTitle: owner.title,
      formType: '144',
    });
  }
  if (rows.length === 0) {
    rows.push({
      date: filingDate.slice(0, 10),
      transactionType: 'intent_to_sell',
      shares: 0,
      pricePerShare: 0,
      totalValue: 0,
      insiderName: owner.name,
      insiderTitle: owner.title,
      formType: '144',
    });
  }
  return rows;
}

export function buildFilingDocumentUrl(
  cik: string,
  accessionNumber: string,
  primaryDocument: string
): string {
  const cikInt = String(parseInt(cik, 10));
  const accessionPath = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionPath}/${primaryDocument}`;
}

export async function fetchFilingXml(
  cik: string,
  accessionNumber: string,
  primaryDocument: string
): Promise<string | null> {
  const url = buildFilingDocumentUrl(cik, accessionNumber, primaryDocument);
  try {
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes('<')) return null;
    return text;
  } catch {
    return null;
  }
}

export { SEC_HEADERS };
