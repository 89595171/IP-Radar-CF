import type { ApiError, IpReport } from './types';

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & ApiError;
  if (!response.ok || data.ok === false) {
    throw new Error(data.error?.message ?? data.message ?? `请求失败：HTTP ${response.status}`);
  }
  return data;
}

export async function getSelfIp(): Promise<{ ok: boolean; available: boolean; message?: string; ip?: string } & Partial<IpReport>> {
  return parseResponse<{ ok: boolean; available: boolean; message?: string; ip?: string } & Partial<IpReport>>(
    await fetch('/api/ip/self', { cache: 'no-store' }),
  );
}

export async function lookupIp(ip: string): Promise<IpReport> {
  const params = new URLSearchParams({ ip });
  return parseResponse<IpReport>(await fetch(`/api/ip/lookup?${params}`, { cache: 'no-store' }));
}

export async function lookupRdap(ip: string): Promise<{ ok: boolean; data: Record<string, unknown>; source: string }> {
  const params = new URLSearchParams({ ip });
  return parseResponse<{ ok: boolean; data: Record<string, unknown>; source: string }>(await fetch(`/api/ip/rdap?${params}`, { cache: 'no-store' }));
}

export async function checkDnsStatus(): Promise<{ configured: boolean; domain?: string; note: string; method: string }> {
  return parseResponse<{ configured: boolean; domain?: string; note: string; method: string }>(await fetch('/api/dns/status', { cache: 'no-store' }));
}

export async function startDnsProbe(): Promise<{ ok: boolean; configured: boolean; id?: string; hosts?: string[]; error?: { message: string } }> {
  return parseResponse<{ ok: boolean; configured: boolean; id?: string; hosts?: string[]; error?: { message: string } }>(
    await fetch('/api/dns/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
  );
}

export async function getDnsResults(id: string): Promise<{ ok: boolean; received: number; expected: number; resolvers: Array<{ ip: string; queryCount: number; queries: string[] }>; message: string }> {
  const params = new URLSearchParams({ id });
  return parseResponse<{ ok: boolean; received: number; expected: number; resolvers: Array<{ ip: string; queryCount: number; queries: string[] }>; message: string }>(
    await fetch(`/api/dns/results?${params}`, { cache: 'no-store' }),
  );
}
