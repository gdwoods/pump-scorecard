/**
 * Places that count as an operating or control nexus when the SEC address
 * is in the United States. Ireland, the Netherlands, Luxembourg, the UK,
 * Canada, and Israel are left off: those domiciles show up constantly on
 * ordinary US issuers, so a subsidiary there is not a useful callout.
 */

export type NexusGroup = 'greater-china' | 'se-asia' | 'offshore' | 'opacity';

export type NexusLocale = {
  id: string;
  label: string;
  group: NexusGroup;
  aliases: string[];
  /** Regex source. Aliases are used when this is omitted. */
  pattern?: string;
};

export const NEXUS_LOCALES: NexusLocale[] = [
  {
    id: 'china',
    label: 'China',
    group: 'greater-china',
    aliases: ["People's Republic of China", 'Mainland China', 'PRC', 'China'],
  },
  {
    id: 'hong-kong',
    label: 'Hong Kong',
    group: 'greater-china',
    aliases: ['Hong Kong', 'Hongkong'],
  },
  {
    id: 'macau',
    label: 'Macau',
    group: 'greater-china',
    aliases: ['Macau', 'Macao'],
  },
  {
    id: 'taiwan',
    label: 'Taiwan',
    group: 'greater-china',
    aliases: ['Taiwan', 'Republic of China', 'R.O.C.'],
    pattern: String.raw`Taiwan|(?<!People's )Republic of China|R\.O\.C\.`,
  },

  { id: 'malaysia', label: 'Malaysia', group: 'se-asia', aliases: ['Malaysia'] },
  { id: 'labuan', label: 'Labuan', group: 'se-asia', aliases: ['Labuan'] },
  { id: 'singapore', label: 'Singapore', group: 'se-asia', aliases: ['Singapore'] },
  { id: 'indonesia', label: 'Indonesia', group: 'se-asia', aliases: ['Indonesia'] },
  { id: 'thailand', label: 'Thailand', group: 'se-asia', aliases: ['Thailand'] },
  {
    id: 'philippines',
    label: 'Philippines',
    group: 'se-asia',
    aliases: ['Philippines', 'Philippine'],
  },
  {
    id: 'vietnam',
    label: 'Vietnam',
    group: 'se-asia',
    aliases: ['Vietnam', 'Viet Nam'],
  },
  { id: 'cambodia', label: 'Cambodia', group: 'se-asia', aliases: ['Cambodia'] },

  {
    id: 'cayman',
    label: 'Cayman Islands',
    group: 'offshore',
    aliases: ['Cayman Islands', 'Cayman'],
  },
  {
    id: 'bvi',
    label: 'British Virgin Islands',
    group: 'offshore',
    aliases: ['British Virgin Islands', 'BVI'],
  },
  { id: 'bermuda', label: 'Bermuda', group: 'offshore', aliases: ['Bermuda'] },
  {
    id: 'marshall',
    label: 'Marshall Islands',
    group: 'offshore',
    aliases: ['Marshall Islands'],
  },
  { id: 'panama', label: 'Panama', group: 'offshore', aliases: ['Panama'] },
  { id: 'belize', label: 'Belize', group: 'offshore', aliases: ['Belize'] },
  { id: 'seychelles', label: 'Seychelles', group: 'offshore', aliases: ['Seychelles'] },
  { id: 'mauritius', label: 'Mauritius', group: 'offshore', aliases: ['Mauritius'] },
  { id: 'cyprus', label: 'Cyprus', group: 'offshore', aliases: ['Cyprus'] },
  { id: 'malta', label: 'Malta', group: 'offshore', aliases: ['Malta'] },
  { id: 'bahamas', label: 'Bahamas', group: 'offshore', aliases: ['Bahamas'] },
  { id: 'samoa', label: 'Samoa', group: 'offshore', aliases: ['Samoa'] },
  { id: 'vanuatu', label: 'Vanuatu', group: 'offshore', aliases: ['Vanuatu'] },
  {
    id: 'nevis',
    label: 'St. Kitts and Nevis',
    group: 'offshore',
    aliases: ['St. Kitts and Nevis', 'Saint Kitts', 'Nevis', 'St. Kitts'],
  },
  { id: 'anguilla', label: 'Anguilla', group: 'offshore', aliases: ['Anguilla'] },
  {
    id: 'cook',
    label: 'Cook Islands',
    group: 'offshore',
    aliases: ['Cook Islands'],
  },
  { id: 'gibraltar', label: 'Gibraltar', group: 'offshore', aliases: ['Gibraltar'] },
  {
    id: 'liechtenstein',
    label: 'Liechtenstein',
    group: 'offshore',
    aliases: ['Liechtenstein'],
  },
  { id: 'liberia', label: 'Liberia', group: 'offshore', aliases: ['Liberia'] },
  { id: 'barbados', label: 'Barbados', group: 'offshore', aliases: ['Barbados'] },
  {
    id: 'jersey',
    label: 'Jersey',
    group: 'offshore',
    aliases: ['Jersey'],
    pattern: String.raw`(?<!New )Jersey`,
  },
  { id: 'guernsey', label: 'Guernsey', group: 'offshore', aliases: ['Guernsey'] },
  {
    id: 'isle-of-man',
    label: 'Isle of Man',
    group: 'offshore',
    aliases: ['Isle of Man'],
  },
  {
    id: 'antigua',
    label: 'Antigua and Barbuda',
    group: 'offshore',
    aliases: ['Antigua and Barbuda', 'Antigua'],
  },

  {
    id: 'russia',
    label: 'Russia',
    group: 'opacity',
    aliases: ['Russian Federation', 'Russia'],
  },
  { id: 'belarus', label: 'Belarus', group: 'opacity', aliases: ['Belarus'] },
  { id: 'kazakhstan', label: 'Kazakhstan', group: 'opacity', aliases: ['Kazakhstan'] },
  { id: 'nigeria', label: 'Nigeria', group: 'opacity', aliases: ['Nigeria'] },
  {
    id: 'uae',
    label: 'United Arab Emirates',
    group: 'opacity',
    aliases: ['United Arab Emirates', 'Ras Al Khaimah', 'Dubai', 'UAE', 'U.A.E.'],
  },
];

export const GROUP_RANK: Record<NexusGroup, number> = {
  'greater-china': 0,
  'se-asia': 1,
  opacity: 2,
  offshore: 3,
};

export function isUsListedCountry(country?: string | null): boolean {
  if (!country) return false;
  const normalized = country.trim().toUpperCase().replace(/\./g, '');
  return (
    normalized === 'US' ||
    normalized === 'USA' ||
    normalized === 'UNITED STATES' ||
    normalized === 'UNITED STATES OF AMERICA'
  );
}
