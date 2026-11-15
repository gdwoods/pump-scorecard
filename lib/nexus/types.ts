export type NexusApiStatus = 'flagged' | 'clear' | 'not_applicable' | 'unknown';

export type NexusApiResponse = {
  ticker: string;
  overseas: boolean;
  countries: string[];
  reason: string;
  evidenceUrl: string | null;
  asOf: string | null;
  status: NexusApiStatus;
};

export type NexusCachedPayload = {
  filingKey: string;
  response: NexusApiResponse;
  computedAt: string;
};

export const NEXUS_KV_PREFIX = 'nexus:v1:';
export const NEXUS_UNIVERSE_KEY = 'nexus:universe';