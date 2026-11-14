export type IpReport = {
  ip: string;
  country: string;
  city: string;
  region: string;
  timezone: string;
  latitude: number | string | null;
  longitude: number | string | null;
  company: string;
  asn: string;
  isBogon: boolean;
  isDatacenter: boolean;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  isAbuser: boolean;
  isMobile: boolean;
  isSatellite: boolean;
  isAnycast: boolean;
  isCrawler: boolean;
  source: string;
  assessment: {
    score: number;
    level: string;
    confidence: 'normal' | 'limited' | 'none';
    confidenceLabel: string;
    reasons: string[];
    securityAvailable: boolean;
    networkType: string;
  };
  enrichmentError?: string;
};

export type ApiError = { ok?: false; error?: { code?: string; message?: string }; message?: string };
