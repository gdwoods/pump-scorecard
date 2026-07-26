// lib/wireNews/feeds.ts
export type WireFeed = {
  id: string;
  source: string;
  url: string;
};

/**
 * Public wire feeds that respond without auth/Cloudflare blocks.
 * ACCESSWIRE and most Business Wire feeds are blocked or empty from serverless.
 */
export const WIRE_FEEDS: WireFeed[] = [
  {
    id: 'gnw-public',
    source: 'GlobeNewswire',
    url: 'https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies',
  },
  {
    id: 'gnw-announcements',
    source: 'GlobeNewswire',
    url: 'https://www.globenewswire.com/RssFeed/subjectcode/13/feedTitle/GlobeNewswire%20-%20Announcements',
  },
  {
    id: 'prn-all',
    source: 'PR Newswire',
    url: 'https://www.prnewswire.com/rss/news-releases-list.rss',
  },
];
