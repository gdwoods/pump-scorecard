import fs from 'fs';
import { detectOperatingNexus } from '../lib/nexus/detectOperatingNexus';
import { selectNexusFilings } from '../lib/nexus/fetchOperatingNexus';
import {
  isUsListedCountry,
  shouldRunOperatingNexus,
} from '../lib/nexus/locales';
import { parseSecAddress } from '../utils/normalizeCountry';

const doc = (form: string, text: string, filingDate = '2026-03-30') => ({
  form,
  filingDate,
  documentUrl: `https://www.sec.gov/example/${form}`,
  text,
});

describe('operating nexus', () => {
  it('treats SEC USA addresses as US-listed and Cayman as a watched domicile', () => {
    expect(isUsListedCountry('USA')).toBe(true);
    expect(isUsListedCountry('United States')).toBe(true);
    expect(isUsListedCountry('U.S.A.')).toBe(true);
    expect(isUsListedCountry('Taiwan')).toBe(false);
    expect(isUsListedCountry('Cayman Islands')).toBe(false);
    expect(shouldRunOperatingNexus('USA')).toBe(true);
    expect(shouldRunOperatingNexus('Cayman Islands')).toBe(true);
    expect(shouldRunOperatingNexus('United Kingdom')).toBe(false);
  });

  it('reads SEC explicit country when stateOrCountry is empty (RCT UK pattern)', () => {
    const parsed = parseSecAddress({
      street1: '167-169 GREAT PORTLAND STREET,',
      city: 'LONDON',
      stateOrCountry: null,
      stateOrCountryDescription: null,
      country: 'United Kingdom',
      countryCode: 'X0',
    });
    expect(parsed?.country).toBe('United Kingdom');
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

  it('ignores geopolitical risk-factor mentions of Russia (POLA pattern)', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        "The impacts of war and other geopolitical events, including but not limited to Russia's invasion of Ukraine, are difficult to predict. In response to the Russian military actions, many businesses headquartered in the Eurozone and the United States have stopped doing business with Russia, which may negatively affect the profitability of those companies. The international turmoil may continue to have a negative impact on the stock market generally."
      ),
    ]);
    expect(result).toBeNull();
  });

  it('ignores compliance facility boilerplate near Nigeria (RCT pattern)', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        'We will be required to comply with all regulations, rules and directives of governmental authorities and agencies applicable to our services in Nigeria and to operation of any facility in any jurisdiction which we would conduct activities.'
      ),
    ]);
    expect(result).toBeNull();
  });

  it('ignores historical BVI organization (CBUS pattern)', () => {
    const result = detectOperatingNexus([
      doc(
        '10-K',
        'Prior to this, Cibus Global was organized as a British Virgin Islands company (Cibus Global, Ltd.), which was formed on September 11, 2008. The Company’s principal executive offices are located at 6455 Nancy Ridge Drive, San Diego, California.'
      ),
    ]);
    expect(result).toBeNull();
  });

  it('still flags a first-person headquarters location', () => {
    const result = detectOperatingNexus([
      doc('10-K', 'Our headquarters are located in Taipei, Taiwan.'),
    ]);
    expect(result?.places).toEqual(['Taiwan']);
  });

  it('for Cayman domiciles, surfaces Singapore ops and drops redundant Cayman', () => {
    const result = detectOperatingNexus(
      [
        doc(
          '20-F',
          'Overview We are a holding company incorporated in the Cayman Islands and headquartered in Singapore. Our principal executive office is located at Level 21, 88 Market Street, CapitaSpring, Singapore 048948. FunVerse Holding Limited, a British Virgin Islands company, wholly owns Yuder.'
        ),
      ],
      { domicileCountry: 'Cayman Islands' }
    );
    expect(result?.places).toEqual(expect.arrayContaining(['Singapore', 'British Virgin Islands']));
    expect(result?.places).not.toContain('Cayman Islands');
    expect(result?.headline).toMatch(/Domiciled in the Cayman Islands/);
    expect(result?.headline).toMatch(/Singapore/);
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

const aimdTenKPath = '/tmp/aimd/10k.htm';
const aimdProxyPath = '/tmp/aimd/def14a.htm';
const hasAimdFixtures = fs.existsSync(aimdTenKPath) && fs.existsSync(aimdProxyPath);

(hasAimdFixtures ? describe : describe.skip)('AIMD filing fixtures', () => {
  it('reads the saved 10-K and proxy as a Taiwan and Cayman nexus', () => {
    const result = detectOperatingNexus([
      {
        form: '10-K',
        filingDate: '2026-03-30',
        documentUrl: 'https://www.sec.gov/example/10-k',
        text: fs.readFileSync(aimdTenKPath, 'utf8'),
      },
      {
        form: 'DEF 14A',
        filingDate: '2026-11-10',
        documentUrl: 'https://www.sec.gov/example/def14a',
        text: fs.readFileSync(aimdProxyPath, 'utf8'),
      },
    ]);

    expect(result?.places).toEqual(expect.arrayContaining(['Taiwan', 'Cayman Islands']));
    expect(result?.evidence.length).toBeGreaterThan(0);
    expect(result?.evidence.length).toBeLessThanOrEqual(3);
  }, 20000);
});

const polaTenKPath = '/tmp/pola/10k.htm';
const polaProxyPath = '/tmp/pola/def14a.htm';
const hasPolaFixtures = fs.existsSync(polaTenKPath) && fs.existsSync(polaProxyPath);

(hasPolaFixtures ? describe : describe.skip)('POLA filing fixtures', () => {
  it('does not invent a Russia nexus from geopolitical risk factors', () => {
    const result = detectOperatingNexus([
      {
        form: '10-K',
        filingDate: '2026-04-15',
        documentUrl: 'https://www.sec.gov/example/pola-10-k',
        text: fs.readFileSync(polaTenKPath, 'utf8'),
      },
      {
        form: 'DEF 14A',
        filingDate: '2026-09-16',
        documentUrl: 'https://www.sec.gov/example/pola-def14a',
        text: fs.readFileSync(polaProxyPath, 'utf8'),
      },
    ]);

    expect(result).toBeNull();
  }, 20000);
});

const rctPath = '/tmp/rct/20f.htm';
const hasRctFixture = fs.existsSync(rctPath);

(hasRctFixture ? describe : describe.skip)('RCT filing fixtures', () => {
  it('does not invent a Nigeria nexus from compliance boilerplate', () => {
    const result = detectOperatingNexus(
      [
        {
          form: '20-F',
          filingDate: '2026-05-15',
          documentUrl: 'https://www.sec.gov/example/rct-20f',
          text: fs.readFileSync(rctPath, 'utf8'),
        },
      ],
      { domicileCountry: 'United Kingdom' }
    );
    // UK domicile should not be scanned in production; if forced, do not flag Nigeria from weak text.
    expect(result?.places?.includes('Nigeria') ?? false).toBe(false);
  }, 20000);
});

const cbusTenKPath = '/tmp/cbus/10k.htm';
const cbusProxyPath = '/tmp/cbus/def14a.htm';
const hasCbusFixtures = fs.existsSync(cbusTenKPath) && fs.existsSync(cbusProxyPath);

(hasCbusFixtures ? describe : describe.skip)('CBUS filing fixtures', () => {
  it('does not invent a BVI nexus from former corporate history', () => {
    const result = detectOperatingNexus([
      {
        form: '10-K',
        filingDate: '2026-03-17',
        documentUrl: 'https://www.sec.gov/example/cbus-10k',
        text: fs.readFileSync(cbusTenKPath, 'utf8'),
      },
      {
        form: 'DEF 14A',
        filingDate: '2026-04-20',
        documentUrl: 'https://www.sec.gov/example/cbus-def14a',
        text: fs.readFileSync(cbusProxyPath, 'utf8'),
      },
    ]);
    expect(result).toBeNull();
  }, 20000);
});

const mpuPath = '/tmp/mpu/20f.htm';
const hasMpuFixture = fs.existsSync(mpuPath);

(hasMpuFixture ? describe : describe.skip)('MPU filing fixtures', () => {
  it('surfaces Singapore ops for a Cayman domicile', () => {
    const result = detectOperatingNexus(
      [
        {
          form: '20-F',
          filingDate: '2026-04-16',
          documentUrl: 'https://www.sec.gov/example/mpu-20f',
          text: fs.readFileSync(mpuPath, 'utf8'),
        },
      ],
      { domicileCountry: 'Cayman Islands' }
    );
    expect(result?.places).toEqual(expect.arrayContaining(['Singapore']));
    expect(result?.places).not.toContain('Cayman Islands');
    expect(result?.headline).toMatch(/Domiciled in the Cayman Islands/);
  }, 20000);
});
