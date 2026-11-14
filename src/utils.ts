export function formatLocation(report?: { city?: string; region?: string; country?: string } | null): string {
  if (!report) return '等待识别';
  return [report.city, report.region, report.country].filter(Boolean).join(' · ') || '暂不可用';
}

export function copyText(text: string) {
  if (!text) return;
  return navigator.clipboard?.writeText(text);
}

export function formatMs(value: number) {
  return `${Math.max(0, Math.round(value))} ms`;
}

export function isPrivateIp(ip: string) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower === '::';
  }
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isFinite(n))) return false;
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}

export function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

export function numberToIpv4(num: number): string {
  return [24, 16, 8, 0].map((shift) => (num >>> shift) & 255).join('.');
}

export function calculateCidr(ip: string, prefixInput: string) {
  const prefix = Number(prefixInput);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some((part) => Number(part) > 255) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error('请输入有效的 IPv4 地址和 0–32 的 CIDR 前缀。');
  }
  const address = ipv4ToNumber(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix);
  const firstHost = prefix >= 31 ? network : network + 1;
  const lastHost = prefix >= 31 ? broadcast : broadcast - 1;
  return {
    network: numberToIpv4(network),
    mask: numberToIpv4(mask),
    wildcard: numberToIpv4((~mask) >>> 0),
    broadcast: numberToIpv4(broadcast),
    firstHost: numberToIpv4(firstHost),
    lastHost: numberToIpv4(lastHost),
    total,
    usable: prefix >= 31 ? total : Math.max(0, total - 2),
    prefix,
  };
}

export function prettyBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
