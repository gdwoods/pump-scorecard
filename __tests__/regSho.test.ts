import {
  appendRegShoFlag,
  listingFromRegShoIndex,
  parseRegShoFile,
} from '../lib/fast/fetchRegSho';

const fixture = `Symbol|Security Name|Market Category|Reg SHO Threshold Flag|Rule 3210|Filler 
ONDS|ONDAS INC COM NEW|S|Y|N| 
AAPD|DIREXION SHS ETF TR DAILY AAPL|G|Y|N| 
20260925230022
`;

describe('Reg SHO threshold parser', () => {
  const index = parseRegShoFile(fixture, '2026-09-25');

  it('indexes a threshold symbol', () => {
    const listing = listingFromRegShoIndex(index, 'onds');
    expect(listing.status).toBe('threshold');
    expect(listing.securityName).toBe('ONDAS INC COM NEW');
    expect(listing.marketCategory).toBe('S');
    expect(listing.tradeDate).toBe('2026-09-25');
  });

  it('adds a soft flag with mapped market and as-of date', () => {
    const listing = listingFromRegShoIndex(index, 'ONDS');
    const flag = appendRegShoFlag([], listing)[0];
    expect(flag).toContain('Reg SHO threshold');
    expect(flag).toContain('NCM');
    expect(flag).toContain('as of 2026-09-25');
  });

  it('returns not_listed for names absent from the file', () => {
    const listing = listingFromRegShoIndex(index, 'AAPL');
    expect(listing.status).toBe('not_listed');
    expect(appendRegShoFlag(['other'], listing)).toEqual(['other']);
  });

  it('rejects an empty file', () => {
    expect(() =>
      parseRegShoFile(
        'Symbol|Security Name|Market Category|Reg SHO Threshold Flag|Rule 3210|Filler \n20260925230022\n',
        '2026-09-25'
      )
    ).toThrow(/empty/);
  });
});
