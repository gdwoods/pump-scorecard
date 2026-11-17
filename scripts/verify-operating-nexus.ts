import fs from 'fs';
import assert from 'node:assert/strict';
import { detectOperatingNexus } from '../lib/nexus/detectOperatingNexus';
import { selectNexusFilings } from '../lib/nexus/fetchOperatingNexus';
import { isUsListedCountry, shouldRunOperatingNexus } from '../lib/nexus/locales';
import { parseSecAddress } from '../utils/normalizeCountry';

const doc = (form: string, text: string, filingDate = '2026-03-30') => ({
  form,
  filingDate,
  documentUrl: `https://www.sec.gov/example/${form}`,
  text,
});

assert.equal(isUsListedCountry('USA'), true);
assert.equal(isUsListedCountry('United States'), true);
assert.equal(isUsListedCountry('U.S.A.'), true);
assert.equal(isUsListedCountry('Taiwan'), false);
assert.equal(shouldRunOperatingNexus('Cayman Islands'), true);
assert.equal(shouldRunOperatingNexus('United Kingdom'), false);

assert.equal(
  parseSecAddress({
    street1: '167-169 GREAT PORTLAND STREET,',
    city: 'LONDON',
    stateOrCountry: null,
    stateOrCountryDescription: null,
    country: 'United Kingdom',
  })?.country,
  'United Kingdom'
);

const aimd = detectOperatingNexus([
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
assert.ok(aimd);
assert.ok(aimd.places.includes('Taiwan'));
assert.ok(aimd.places.includes('Cayman Islands'));
assert.equal(aimd.places.includes('China'), false);
assert.match(aimd.headline, /Listed in the US/);
assert.ok(aimd.evidence.some((item) => item.form === '10-K'));
assert.ok(aimd.evidence.some((item) => item.form === 'DEF 14A'));

const noise = detectOperatingNexus([
  doc(
    '10-K',
    "Many foreign countries, including some EU countries, India, Japan, and China, have compulsory licensing laws. The application and interpretation of China's intellectual property right laws continue to evolve. We sell to customers in Taiwan. Our administrative offices are located in New Jersey. Mr. Chiang served as chairman of Taiwan-incorporated companies including China Steel Chemical Corporation."
  ),
]);
assert.ok(noise);
assert.deepEqual(noise.places, ['Taiwan']);

assert.equal(
  detectOperatingNexus([
    doc('10-K', 'We are subject to risks related to our operations in China, including changes in the regulatory environment.'),
  ]),
  null
);

assert.equal(
  detectOperatingNexus([
    doc(
      '10-K',
      "The impacts of war and other geopolitical events, including but not limited to Russia's invasion of Ukraine, are difficult to predict. In response to the Russian military actions, many businesses headquartered in the Eurozone and the United States have stopped doing business with Russia, which may negatively affect the profitability of those companies. The international turmoil may continue to have a negative impact on the stock market generally."
    ),
  ]),
  null,
  'POLA-style Russia risk factor should not count'
);

assert.equal(
  detectOperatingNexus([
    doc(
      '10-K',
      'We will be required to comply with all regulations, rules and directives of governmental authorities and agencies applicable to our services in Nigeria and to operation of any facility in any jurisdiction which we would conduct activities.'
    ),
  ]),
  null,
  'RCT-style Nigeria compliance sentence should not count'
);

assert.equal(
  detectOperatingNexus([
    doc(
      '10-K',
      'Prior to this, Cibus Global was organized as a British Virgin Islands company (Cibus Global, Ltd.), which was formed on September 11, 2008. The Company’s principal executive offices are located at 6455 Nancy Ridge Drive, San Diego, California.'
    ),
  ]),
  null,
  'CBUS-style historical BVI organization should not count'
);

assert.deepEqual(
  detectOperatingNexus([doc('10-K', 'Our headquarters are located in Taipei, Taiwan.')])?.places,
  ['Taiwan']
);

const mpuStyle = detectOperatingNexus(
  [
    doc(
      '20-F',
      'Overview We are a holding company incorporated in the Cayman Islands and headquartered in Singapore. Our principal executive office is located at Level 21, 88 Market Street, CapitaSpring, Singapore 048948. FunVerse Holding Limited, a British Virgin Islands company, wholly owns Yuder.'
    ),
  ],
  { domicileCountry: 'Cayman Islands' }
);
assert.ok(mpuStyle?.places.includes('Singapore'));
assert.ok(mpuStyle?.places.includes('British Virgin Islands'));
assert.equal(mpuStyle?.places.includes('Cayman Islands'), false);
assert.match(mpuStyle!.headline, /Domiciled in the Cayman Islands/);

const sea = detectOperatingNexus([
  doc(
    '10-K',
    'Our principal executive offices are located in Kuala Lumpur, Malaysia. Voting agreements cover shares held by Example Ltd., a British Virgin Islands company.'
  ),
]);
assert.ok(sea?.places.includes('Malaysia'));
assert.ok(sea?.places.includes('British Virgin Islands'));

const prc = detectOperatingNexus([
  doc('10-K', "Our product development facility is in the People's Republic of China."),
]);
assert.deepEqual(prc?.places, ['China']);

assert.deepEqual(
  detectOperatingNexus([doc('10-K', 'Our administrative offices are located in St. Helier, Jersey.')])?.places,
  ['Jersey']
);
assert.equal(
  detectOperatingNexus([doc('10-K', 'Our administrative offices are located in Newark, New Jersey.')]),
  null
);

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
assert.deepEqual(filings.map((filing) => filing.form), ['10-K', 'DEF 14A']);
assert.ok(filings[0].documentUrl.includes('form10-k.htm'));

const aimdTenKPath = '/tmp/aimd/10k.htm';
const aimdProxyPath = '/tmp/aimd/def14a.htm';
if (fs.existsSync(aimdTenKPath) && fs.existsSync(aimdProxyPath)) {
  const live = detectOperatingNexus([
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
  console.log('AIMD places:', live?.places);
  console.log('AIMD headline:', live?.headline);
  assert.ok(live?.places.includes('Taiwan'), 'AIMD should include Taiwan');
  assert.ok(live?.places.includes('Cayman Islands'), 'AIMD should include Cayman Islands');
}

const polaTenKPath = '/tmp/pola/10k.htm';
const polaProxyPath = '/tmp/pola/def14a.htm';
if (fs.existsSync(polaTenKPath) && fs.existsSync(polaProxyPath)) {
  const pola = detectOperatingNexus([
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
  console.log('POLA places:', pola?.places ?? null);
  assert.equal(pola, null, 'POLA should not invent a Russia nexus');
}

if (fs.existsSync('/tmp/rct/20f.htm')) {
  const rct = detectOperatingNexus(
    [
      {
        form: '20-F',
        filingDate: '2026-05-15',
        documentUrl: 'https://www.sec.gov/example/rct-20f',
        text: fs.readFileSync('/tmp/rct/20f.htm', 'utf8'),
      },
    ],
    { domicileCountry: 'United Kingdom' }
  );
  console.log('RCT places:', rct?.places ?? null);
  assert.equal(rct?.places?.includes('Nigeria') ?? false, false, 'RCT should not invent Nigeria');
}

if (fs.existsSync('/tmp/cbus/10k.htm') && fs.existsSync('/tmp/cbus/def14a.htm')) {
  const cbus = detectOperatingNexus([
    {
      form: '10-K',
      filingDate: '2026-03-17',
      documentUrl: 'https://www.sec.gov/example/cbus-10k',
      text: fs.readFileSync('/tmp/cbus/10k.htm', 'utf8'),
    },
    {
      form: 'DEF 14A',
      filingDate: '2026-04-20',
      documentUrl: 'https://www.sec.gov/example/cbus-def14a',
      text: fs.readFileSync('/tmp/cbus/def14a.htm', 'utf8'),
    },
  ]);
  console.log('CBUS places:', cbus?.places ?? null);
  assert.equal(cbus, null, 'CBUS should not invent BVI from history');
}

if (fs.existsSync('/tmp/mpu/20f.htm')) {
  const mpu = detectOperatingNexus(
    [
      {
        form: '20-F',
        filingDate: '2026-04-16',
        documentUrl: 'https://www.sec.gov/example/mpu-20f',
        text: fs.readFileSync('/tmp/mpu/20f.htm', 'utf8'),
      },
    ],
    { domicileCountry: 'Cayman Islands' }
  );
  console.log('MPU places:', mpu?.places);
  console.log('MPU headline:', mpu?.headline);
  assert.ok(mpu?.places.includes('Singapore'), 'MPU should include Singapore');
  assert.equal(mpu?.places.includes('Cayman Islands'), false);
}

console.log('operating nexus checks passed');
