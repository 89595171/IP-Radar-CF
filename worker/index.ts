interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  IPAPIIS_KEY?: string;
  DNS_PROBE_DOMAIN?: string;
  CF_DNS_ZONE_ID?: string;
  CF_DNS_API_TOKEN?: string;
}

type CfMeta = {
  country?: string;
  city?: string;
  region?: string;
  regionCode?: string;
  continent?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
  asn?: number;
  asOrganization?: string;
  colo?: string;
  tlsVersion?: string;
  httpProtocol?: string;
  [key: string]: unknown;
};

type IpIntel = {
  ip: string;
  is_bogon?: boolean;
  is_datacenter?: boolean | string;
  is_vpn?: boolean | string;
  is_proxy?: boolean | string;
  is_tor?: boolean | string;
  is_abuser?: boolean | string;
  is_mobile?: boolean | string;
  is_satellite?: boolean | string;
  is_anycast?: boolean | string;
  is_crawler?: boolean | string;
  company?: unknown;
  asn?: unknown;
  location?: unknown;
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  [key: string]: unknown;
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function errorResponse(message: string, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isIPv6(value: string): boolean {
  if (!value.includes(':') || value.includes('%') || value.length > 45 || value.includes(':::')) return false;
  if ((value.match(/::/g) ?? []).length > 1) return false;
  const source = value.toLowerCase();
  const hasCompression = source.includes('::');
  const parts = source.split(':');
  if (!hasCompression && parts.some((part) => !part)) return false;
  let groups = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (part.includes('.')) {
      if (i !== parts.length - 1 || !isIPv4(part)) return false;
      groups += 2;
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/.test(part)) return false;
    groups += 1;
  }
  return hasCompression ? groups < 8 : groups === 8;
}

function isValidIp(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

function boolFlag(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === 'yes';
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function extractCompany(data: IpIntel): string {
  if (typeof data.company === 'string') return data.company;
  const company = objectRecord(data.company);
  return String(company.name ?? company.company ?? company.org ?? company.domain ?? '');
}

function extractAsn(data: IpIntel): string {
  if (typeof data.asn === 'string') return data.asn;
  const asn = objectRecord(data.asn);
  const number = asn.asn ?? asn.number ?? asn.asn_number;
  const org = asn.org ?? asn.name ?? asn.organization;
  return [number ? String(number).startsWith('AS') ? number : `AS${number}` : '', org ?? ''].filter(Boolean).join(' ');
}

function riskAssessment(data: IpIntel, company: string, asn: string) {
  const flagsPresent = ['is_datacenter', 'is_vpn', 'is_proxy', 'is_tor', 'is_abuser'].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  const reasons: string[] = [];
  let deductions = 0;

  if (boolFlag(data.is_tor)) { deductions += 35; reasons.push('命中 Tor 出口节点情报'); }
  if (boolFlag(data.is_proxy)) { deductions += 30; reasons.push('命中公开代理情报'); }
  if (boolFlag(data.is_vpn)) { deductions += 24; reasons.push('命中 VPN 节点情报'); }
  if (boolFlag(data.is_datacenter)) { deductions += 18; reasons.push('地址归属数据中心网络'); }
  if (boolFlag(data.is_abuser)) { deductions += 28; reasons.push('近期滥用情报存在记录'); }
  if (boolFlag(data.is_bogon)) { deductions += 60; reasons.push('属于特殊用途或不可路由地址'); }

  const org = `${company} ${asn}`.toLowerCase();
  const companyType = String(objectRecord(data.company).type ?? '').toLowerCase();
  const asnType = String(objectRecord(data.asn).type ?? '').toLowerCase();
  const isHostingOrg = companyType === 'hosting' || asnType === 'hosting';
  const isIspOrg = companyType === 'isp' || asnType === 'isp';
  const hostingTerms = ['amazon', 'aws', 'google cloud', 'microsoft', 'azure', 'digitalocean', 'ovh', 'hetzner', 'vultr', 'linode', 'contabo', 'oracle cloud', 'hosting', 'datacenter', 'data center', 'cloud server', 'cloudflare'];
  const heuristicHosting = !flagsPresent && (isHostingOrg || hostingTerms.some((term) => org.includes(term)));
  if (heuristicHosting) reasons.push('组织名称含云服务/托管网络特征（启发式判断）');

  const score = Math.max(0, Math.min(100, (flagsPresent ? 100 : 86) - deductions - (heuristicHosting ? 18 : 0)));
  const level = score >= 85 ? '较低风险' : score >= 65 ? '中等风险' : '较高风险';
  return {
    score,
    level,
    confidence: flagsPresent ? 'normal' : 'limited',
    confidenceLabel: flagsPresent ? '已接入安全情报字段' : '基础情报参考，未启用完整安全检测',
    reasons,
    securityAvailable: flagsPresent,
    networkType: boolFlag(data.is_mobile) ? '移动网络' : boolFlag(data.is_tor) || boolFlag(data.is_proxy) || boolFlag(data.is_vpn) ? '代理 / VPN 出口' : boolFlag(data.is_datacenter) || heuristicHosting ? '数据中心 / 托管网络' : isIspOrg ? 'ISP 接入网络（可能为家宽）' : '需结合运营商进一步判断',
  };
}

async function fetchIpIntel(ip: string, env: Env): Promise<IpIntel> {
  const endpoint = 'https://api.ipapi.is/';
  let response: Response;
  if (env.IPAPIIS_KEY) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ q: ip, key: env.IPAPIIS_KEY }),
    });
  } else {
    const url = new URL(endpoint);
    url.searchParams.set('q', ip);
    response = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  }
  if (!response.ok) {
    const detail = response.status === 429 ? 'IP 情报服务达到当前额度限制，请稍后再试或配置 IPAPIIS_KEY。' : `IP 情报服务返回 HTTP ${response.status}。`;
    throw new Error(detail);
  }
  const data = await response.json() as IpIntel & { error?: string };
  if (data.error) throw new Error(String(data.error));
  if (!data.ip) throw new Error('IP 情报服务没有返回有效 IP 数据。');
  return data;
}

function normalizeIp(data: IpIntel) {
  const company = extractCompany(data);
  const asn = extractAsn(data);
  const location = objectRecord(data.location);
  const assessment = riskAssessment(data, company, asn);
  const country = String(data.country ?? location.country ?? location.country_name ?? '');
  const city = String(data.city ?? location.city ?? '');
  const region = String(data.region ?? location.state ?? location.region ?? '');
  return {
    ip: data.ip,
    country,
    city,
    region,
    timezone: String(data.timezone ?? location.timezone ?? ''),
    latitude: data.lat ?? location.latitude ?? null,
    longitude: data.lon ?? location.longitude ?? null,
    company: company || '未知',
    asn: asn || '未知',
    isBogon: boolFlag(data.is_bogon),
    isDatacenter: boolFlag(data.is_datacenter),
    isVpn: boolFlag(data.is_vpn),
    isProxy: boolFlag(data.is_proxy),
    isTor: boolFlag(data.is_tor),
    isAbuser: boolFlag(data.is_abuser),
    isMobile: boolFlag(data.is_mobile),
    isSatellite: boolFlag(data.is_satellite),
    isAnycast: boolFlag(data.is_anycast),
    isCrawler: boolFlag(data.is_crawler),
    assessment,
    source: 'ipapi.is',
  };
}

function cfFallback(ip: string, cf: CfMeta | undefined) {
  const meta = cf ?? {};
  const company = String(meta.asOrganization ?? '');
  return {
    ip,
    country: meta.country ?? '',
    city: meta.city ?? '',
    region: meta.region ?? '',
    timezone: meta.timezone ?? '',
    latitude: meta.latitude ?? null,
    longitude: meta.longitude ?? null,
    company: company || '未知',
    asn: meta.asn ? `AS${meta.asn}${company ? ` ${company}` : ''}` : '未知',
    isBogon: false,
    isDatacenter: false,
    isVpn: false,
    isProxy: false,
    isTor: false,
    isAbuser: false,
    isMobile: false,
    isSatellite: false,
    isAnycast: false,
    isCrawler: false,
    assessment: {
      score: -1,
      level: '未完成',
      confidence: 'none',
      confidenceLabel: '仅有 Cloudflare 连接元数据，未完成 IP 安全情报查询',
      reasons: [],
      securityAvailable: false,
      networkType: '未知',
    },
    source: 'Cloudflare request metadata',
  };
}

function normalizeHostname(value: string) {
  return value.toLowerCase().replace(/\.$/, '');
}

async function handleDnsStart(env: Env) {
  const domain = normalizeHostname(env.DNS_PROBE_DOMAIN ?? '');
  if (!domain || !env.CF_DNS_ZONE_ID || !env.CF_DNS_API_TOKEN) {
    return json({
      ok: false,
      configured: false,
      error: {
        code: 'DNS_PROBE_NOT_CONFIGURED',
        message: 'DNS 泄露真实探测尚未配置。需要探测域名、Cloudflare Zone ID 和 DNS Analytics 只读 Token。请查看项目 README 的 DNS 探针配置章节。',
      },
    }, 200);
  }
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hosts = Array.from({ length: 5 }, (_, index) => `p${id}-${index + 1}.${domain}`);
  return json({ ok: true, configured: true, id, hosts, startedAt: new Date().toISOString() });
}

async function handleDnsResults(url: URL, env: Env) {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[a-f0-9]{24}$/.test(id)) return errorResponse('探测会话编号无效。');
  const domain = normalizeHostname(env.DNS_PROBE_DOMAIN ?? '');
  if (!domain || !env.CF_DNS_ZONE_ID || !env.CF_DNS_API_TOKEN) {
    return json({ ok: false, configured: false, resolvers: [], received: 0, error: 'DNS 探针未配置。' }, 200);
  }
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStart = start.toISOString().slice(0, 10);
  const dateEnd = now.toISOString().slice(0, 10);
  const gql = `query DnsProbe { viewer { zones(filter: { zoneTag: "${env.CF_DNS_ZONE_ID}" }) { dnsAnalyticsAdaptive(limit: 10000, filter: { date_geq: "${dateStart}", date_leq: "${dateEnd}" }, orderBy: [datetime_DESC]) { queryName sourceIP datetime queryType responseCode } } } }`;
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CF_DNS_API_TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ query: gql }),
  });
  if (!response.ok) {
    return json({ ok: false, configured: true, resolvers: [], received: 0, error: `Cloudflare Analytics API 返回 HTTP ${response.status}，请检查 Token 权限和 Zone ID。` }, 502);
  }
  const result = await response.json() as {
    data?: { viewer?: { zones?: Array<{ dnsAnalyticsAdaptive?: Array<{ queryName?: string; sourceIP?: string; datetime?: string; queryType?: string; responseCode?: string }> }> } };
    errors?: Array<{ message?: string }>;
  };
  if (result.errors?.length) {
    const message = result.errors.map((item) => item.message).filter(Boolean).join('；');
    return json({ ok: false, configured: true, resolvers: [], received: 0, error: `DNS Analytics 查询失败：${message}` }, 502);
  }
  const rows = result.data?.viewer?.zones?.[0]?.dnsAnalyticsAdaptive ?? [];
  const suffix = `.${domain}`;
  const expectedPrefix = `p${id}-`;
  const matched = rows.filter((row) => {
    const name = normalizeHostname(row.queryName ?? '');
    return name.endsWith(suffix) && name.slice(0, -(suffix.length)).startsWith(expectedPrefix) && Boolean(row.sourceIP);
  });
  const unique = new Map<string, { ip: string; firstSeen?: string; queryCount: number; queries: string[] }>();
  for (const row of matched) {
    const ip = String(row.sourceIP);
    const current = unique.get(ip) ?? { ip, firstSeen: row.datetime, queryCount: 0, queries: [] };
    current.queryCount += 1;
    if (row.queryName && current.queries.length < 5) current.queries.push(row.queryName);
    unique.set(ip, current);
  }
  return json({
    ok: true,
    configured: true,
    received: matched.length,
    expected: 5,
    resolvers: Array.from(unique.values()),
    message: matched.length ? '已从权威 DNS 分析数据中观察到递归解析器出口 IP。' : '暂未观察到探测查询。分析数据可能有延迟，请稍后重新查询。',
    evidence: 'Cloudflare authoritative DNS analytics sourceIP',
  });
}

async function routeApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/health') {
    return json({ ok: true, service: 'ip-radar-cf', time: new Date().toISOString(), version: '1.0.0' });
  }

  if (request.method === 'GET' && path === '/api/ip/self') {
    const ip = request.headers.get('cf-connecting-ip') ?? '';
    if (!ip) return json({ ok: false, available: false, message: '本地开发环境没有 Cloudflare 访客 IP 头。部署到 Cloudflare Workers 后即可自动识别。' }, 200);
    try {
      const data = await fetchIpIntel(ip, env);
      return json({ ok: true, available: true, ...normalizeIp(data), cf: requestCf(request) });
    } catch (error) {
      const fallback = cfFallback(ip, requestCf(request));
      return json({
        ok: true,
        available: true,
        ...fallback,
        enrichmentError: error instanceof Error ? error.message : 'IP 情报服务暂时不可用',
        cf: requestCf(request),
      });
    }
  }

  if (request.method === 'GET' && path === '/api/ip/lookup') {
    const ip = (url.searchParams.get('ip') ?? '').trim();
    if (!isValidIp(ip)) return errorResponse('请输入有效的 IPv4 或 IPv6 地址。');
    try {
      const data = await fetchIpIntel(ip, env);
      return json({ ok: true, ...normalizeIp(data) });
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'IP 查询失败。', 502, 'IP_LOOKUP_FAILED');
    }
  }

  if (request.method === 'GET' && path === '/api/ip/rdap') {
    const ip = (url.searchParams.get('ip') ?? '').trim();
    if (!isValidIp(ip)) return errorResponse('请输入有效的 IPv4 或 IPv6 地址。');
    try {
      const response = await fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
        headers: { accept: 'application/rdap+json, application/json' },
      });
      if (!response.ok) return errorResponse(`RDAP 注册信息服务返回 HTTP ${response.status}。`, 502, 'RDAP_UPSTREAM_ERROR');
      const data = await response.json();
      return json({ ok: true, data, source: 'rdap.org' });
    } catch {
      return errorResponse('RDAP 查询暂时失败，请稍后重试。', 502, 'RDAP_LOOKUP_FAILED');
    }
  }

  if (request.method === 'GET' && path === '/api/dns/status') {
    const configured = Boolean(env.DNS_PROBE_DOMAIN && env.CF_DNS_ZONE_ID && env.CF_DNS_API_TOKEN);
    return json({
      ok: true,
      configured,
      domain: env.DNS_PROBE_DOMAIN ? normalizeHostname(env.DNS_PROBE_DOMAIN) : null,
      method: 'Cloudflare DNS Analytics authoritative resolver observation',
      note: configured ? '已完成基础配置检查；真实探测还要求配置通配符 DNS 和 Worker 路由。' : '尚未配置 DNS_PROBE_DOMAIN、CF_DNS_ZONE_ID、CF_DNS_API_TOKEN。',
    });
  }

  if (request.method === 'POST' && path === '/api/dns/start') return handleDnsStart(env);

  if (request.method === 'GET' && path === '/api/dns/results') {
    try {
      return await handleDnsResults(url, env);
    } catch {
      return errorResponse('读取 DNS 分析数据失败，请检查 Cloudflare Analytics Token 权限。', 502, 'DNS_ANALYTICS_FAILED');
    }
  }

  return errorResponse('API endpoint not found。', 404, 'NOT_FOUND');
}

function requestCf(request: Request): CfMeta | undefined {
  return (request as Request & { cf?: CfMeta }).cf;
}

function probeResponse(request: Request): Response {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  return new Response(JSON.stringify({ ok: true, probe: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return routeApi(request, env);

    const probeDomain = normalizeHostname(env.DNS_PROBE_DOMAIN ?? '');
    const host = normalizeHostname(url.hostname);
    if (probeDomain && host !== probeDomain && host.endsWith(`.${probeDomain}`) && url.pathname.startsWith('/probe')) {
      return probeResponse(request);
    }

    return env.ASSETS.fetch(request);
  },
};
