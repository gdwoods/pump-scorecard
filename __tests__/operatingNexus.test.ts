import fs from 'fs';
import { detectOperatingNexus } from '../lib/nexus/detectOperatingNexus';
import { selectNexusFilings } from '../lib/nexus/fetchOperatingNexus';
import { isUsListedCountry } from '../lib/nexus/locales';

const doc = (form: string, text: string, filingDate = '2026-03-30') => ({
  form,
  filingDate,
  documentUrl: `https://www.sec.gov/example/${form}`,
  text,
});

describe('operating nexus', () => {
  it('treats SEC USA addresses as US-listed', () => {
    expect(isUsListedCountry('USA')).toBe(true);
    expect(isUsListedCountry('United States')).toBe(true);
    expect(isUsListedCountry('U.S.A.')).toBe(true);
    expect(isUsListedCountry('Taiwan')).toBe(false);
    expect(isUsListedCountry('Cayman Islands')).toBe(false);
  });

  it('flags Taiwan operations and a Cayman control vehicle', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        'ITEM 2. DESCRIPTION OF PROPERTY. Our administrative offices are located at Houston, Texas and in Taiwan. Our product development facility is in Taiwan. Many of our employees are based in Taiwan.'
      ),
      doc(
        'DEF 14A',
        'The annual meeting of stockholders will be held on December 24, 2026 at 5:30 p.m. Taiwan Standard Time at 10F-2, No. 66, Shengyi 5th Rd., Zhubei City, Hsinchu County 302, Taiwan (R.O.C.). Includes shares owned directly by Ainos Inc., a Cayman Islands company ("Ainos KY").',
        '2026-11-10'
      ),
    ]);

    expect(result).not.toBeNull();
    expect(result?.places).toEqual(expect.arrayContaining(['Taiwan', 'Cayman Islands']));
    expect(result?.places).not.toContain('China');
    expect(result?.headline).toMatch(/Listed in the US/);
    expect(result?.evidence.some((item) => item.form === '10-K')).toBe(true);
    expect(result?.evidence.some((item) => item.form === 'DEF 14A')).toBe(true);
  });

  it('ignores China boilerplate, customer mentions, and New Jersey', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        'Many foreign countries, including some EU countries, India, Japan, and China, have compulsory licensing laws. The application and interpretation of China\'s intellectual property right laws continue to evolve. We sell to customers in Taiwan. Our administrative offices are located in New Jersey. Mr. Chiang served as chairman of Taiwan-incorporated companies including China Steel Chemical Corporation.'
      ),
    ]);

    const places = result?.places ?? [];
    expect(places).not.toContain('China');
    expect(places).not.toContain('Jersey');
    expect(places).toContain('Taiwan');
  });

  it('does not treat a China risk-factor sentence as an operating nexus', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        'We are subject to risks related to our operations in China, including changes in the regulatory environment.'
      ),
    ]);
    expect(result).toBeNull();
  });

  it('flags an office in a listed locale and a named offshore holder', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        'Our principal executive offices are located in Kuala Lumpur, Malaysia. Voting agreements cover shares held by Example Ltd., a British Virgin Islands company.'
      ),
    ]);
    expect(result?.places).toEqual(expect.arrayContaining(['Malaysia', 'British Virgin Islands']));
  });

  it("maps People's Republic to China and not Taiwan", () => {
    const result = detectOperatingNexus([
      doc('10-K', "Our product development facility is in the People's Republic of China."),
    ]);
    expect(result?.places).toEqual(['China']);
  });

  it('flags a Jersey office and ignores New Jersey', () => {
    const jersey = detectOperatingNexus([
      doc('10-K', 'Our administrative offices are located in St. Helier, Jersey.'),
    ]);
    const newJersey = detectOperatingNexus([
      doc('10-K', 'Our administrative offices are located in Newark, New Jersey.'),
    ]);
    expect(jersey?.places).toEqual(['Jersey']);
    expect(newJersey).toBeNull();
  });

  it('prefers the 10-K over a newer 10-Q and keeps the proxy', () => {
    const filings = selectNexusFilings('0001014763', {
      filings: {
        recent: {
          form: ['10-Q', 'DEF 14A', '10-K', '8-K'],
          filingDate: ['2026-08-03', '2026-11-10', '2026-03-30', '2026-10-16'],
          accessionNumber: [
            '0001493152-26-035833',
            '0001493152-26-050962',
            '0001493152-26-013579',
            '0001493152-26-047400',
          ],
          primaryDocument: ['form10-q.htm', 'formdef14a.htm', 'form10-k.htm', 'form8-k.htm'],
        },
      },
    });

    expect(filings.map((filing) => filing.form)).toEqual(['10-K', 'DEF 14A']);
    expect(filings[0].documentUrl).toContain('form10-k.htm');
    expect(filings[1].filingDate).toBe('2026-11-10');
  });
});

const tenKPath = '/tmp/aimd/10k.htm';
const proxyPath = '/tmp/aimd/def14a.htm';
const hasAimdFixtures = fs.existsSync(tenKPath) && fs.existsSync(proxyPath);

(hasAimdFixtures ? describe : describe.skip)('AIMD filing fixtures', () => {
  it('reads the saved 10-K and proxy as a Taiwan and Cayman nexus', () => {
    const result = detectOperatingNexus([
      {
        form: '10-K',
        filingDate: '2026-03-30',
        documentUrl: 'https://www.sec.gov/example/10-k',
        text: fs.readFileSync(tenKPath, 'utf8'),
      },
      {
        form: 'DEF 14A',
        filingDate: '2026-11-10',
        documentUrl: 'https://www.sec.gov/example/def14a',
        text: fs.readFileSync(proxyPath, 'utf8'),
      },
    ]);

    expect(result?.places).toEqual(expect.arrayContaining(['Taiwan', 'Cayman Islands']));
    expect(result?.evidence.length).toBeGreaterThan(0);
    expect(result?.evidence.length).toBeLessThanOrEqual(3);
  }, 20000);
});
