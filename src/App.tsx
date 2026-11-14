import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, Copy, Database,
  ExternalLink, FileSearch, Fingerprint, Globe, Info, Laptop, Loader2,
  MapPin, Menu, Network, Radar, RefreshCw, Router, Search, Server,
  Shield, ShieldAlert, ShieldCheck, Sparkles, Wifi, X, Zap, Cable,
} from 'lucide-react';
import { checkDnsStatus, getDnsResults, getSelfIp, lookupIp, lookupRdap, startDnsProbe } from './api';
import type { IpReport } from './types';
import { calculateCidr, copyText, formatLocation, formatMs, isPrivateIp, prettyBytes } from './utils';

type View = 'overview' | 'ip' | 'purity' | 'dns-leak' | 'webrtc' | 'ipv6' | 'dns-lookup' | 'rdap' | 'cidr' | 'network';

const NAV_GROUPS = [
  { label: '总览', items: [{ id: 'overview', name: '检测中心', icon: Radar }] },
  { label: 'IP 情报', items: [{ id: 'ip', name: 'IP 地址查询', icon: Globe }, { id: 'purity', name: 'IP 纯净度', icon: ShieldCheck }] },
  { label: '隐私检测', items: [{ id: 'dns-leak', name: 'DNS 泄露检测', icon: Database }, { id: 'webrtc', name: 'WebRTC 检测', icon: Fingerprint }, { id: 'ipv6', name: 'IPv6 泄露检测', icon: Network }] },
  { label: '网络工具', items: [{ id: 'dns-lookup', name: 'DNS 查询', icon: Search }, { id: 'rdap', name: 'WHOIS / RDAP', icon: FileSearch }, { id: 'cidr', name: 'CIDR 计算器', icon: Cable }, { id: 'network', name: '网络质量', icon: Activity }] },
] as const;

const VIEW_META: Record<View, { title: string; subtitle: string; eyebrow: string }> = {
  overview: { title: '网络检测中心', subtitle: '实时了解当前网络出口、IP 身份与隐私暴露情况。', eyebrow: 'NETWORK INTELLIGENCE' },
  ip: { title: 'IP 地址查询', subtitle: '查询 IPv4 / IPv6 的地理位置、运营商、ASN 与网络归属。', eyebrow: 'IP INTELLIGENCE' },
  purity: { title: 'IP 纯净度检测', subtitle: '综合网络归属与公开威胁情报，评估当前出口 IP 的风险特征。', eyebrow: 'REPUTATION CHECK' },
  'dns-leak': { title: 'DNS 泄露检测', subtitle: '通过随机子域名和权威 DNS 查询记录，观察实际递归解析器出口。', eyebrow: 'PRIVACY AUDIT' },
  webrtc: { title: 'WebRTC 泄露检测', subtitle: '检查浏览器 ICE 候选地址，识别可能暴露的公网与本地地址。', eyebrow: 'BROWSER PRIVACY' },
  ipv6: { title: 'IPv6 泄露检测', subtitle: '分别探测 IPv4 与 IPv6 出口，检查代理隧道是否覆盖 IPv6。', eyebrow: 'DUAL STACK CHECK' },
  'dns-lookup': { title: 'DNS 解析查询', subtitle: '查询 A、AAAA、MX、TXT、NS、CNAME 等常用 DNS 记录。', eyebrow: 'DNS TOOLKIT' },
  rdap: { title: 'WHOIS / RDAP', subtitle: '查看 IP 网段注册信息、网络范围、注册机构和相关事件。', eyebrow: 'REGISTRY LOOKUP' },
  cidr: { title: 'CIDR 子网计算器', subtitle: '计算 IPv4 网络地址、子网掩码、广播地址与可用主机范围。', eyebrow: 'NETWORK CALCULATOR' },
  network: { title: '网络质量检测', subtitle: '测量当前浏览器到本站 Worker 的往返延迟与基础下载表现。', eyebrow: 'NETWORK PERFORMANCE' },
};

function App() {
  const [view, setView] = useState<View>(() => viewFromHash());
  const [selfReport, setSelfReport] = useState<IpReport | null>(null);
  const [selfLoading, setSelfLoading] = useState(true);
  const [selfMessage, setSelfMessage] = useState('正在识别网络出口…');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clock, setClock] = useState(new Date());

  const refreshSelf = useCallback(async () => {
    setSelfLoading(true);
    try {
      const data = await getSelfIp();
      if (data.available && data.ip) {
        setSelfReport(data as IpReport);
        setSelfMessage(data.enrichmentError ? '已识别出口 IP · 情报补充暂不可用' : '网络出口识别完成');
      } else {
        setSelfReport(null);
        setSelfMessage(data.message ?? '部署后即可自动识别访客 IP');
      }
    } catch (error) {
      setSelfMessage(error instanceof Error ? error.message : 'IP 识别失败');
    } finally {
      setSelfLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSelf();
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => { window.clearInterval(timer); window.removeEventListener('hashchange', onHash); };
  }, [refreshSelf]);

  const navigate = (next: View) => {
    setView(next);
    window.location.hash = next === 'overview' ? '' : next;
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const meta = VIEW_META[view];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Radar size={22} strokeWidth={1.8} /></div>
          <div className="brand-copy"><strong>IP <span>RADAR</span></strong><small>NETWORK INTELLIGENCE</small></div>
          <button className="icon-button sidebar-close" aria-label="关闭导航" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <div className="sidebar-status"><span className="live-pulse" /> 系统运行中 <span className="status-code">EDGE / CN</span></div>
        <nav className="side-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return <button key={item.id} className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(item.id as View)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item.name}</span>{active && <span className="nav-active-dot" />}
                </button>;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <div className="sidebar-card-icon"><Sparkles size={16} /></div>
            <strong>持续进化中</strong>
            <p>更多网络诊断与 IP 情报功能正在规划。</p>
            <span>IP RADAR · v1.0.0</span>
          </div>
          <div className="side-footer"><span>隐私优先</span><span>·</span><span>Cloudflare Edge</span></div>
        </div>
      </aside>

      {mobileOpen && <button className="mobile-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>IP Radar</span><ChevronRight size={14} /><strong>{meta.title}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="edge-indicator"><span className="live-pulse" /> EDGE ONLINE</div>
            <div className="topbar-clock"><Clock3 size={14} /> {clock.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
            <div className="avatar">IR</div>
          </div>
        </header>
        <div className="page-wrap">
          <div className="page-heading">
            <div><div className="eyebrow"><span /> {meta.eyebrow}</div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div>
            <button className="button button-ghost button-small" onClick={() => void refreshSelf()} disabled={selfLoading}><RefreshCw size={15} className={selfLoading ? 'spin' : ''} /> 刷新检测</button>
          </div>
          {view === 'overview' && <Dashboard report={selfReport} loading={selfLoading} message={selfMessage} navigate={navigate} />}
          {view === 'ip' && <IpLookupPage selfReport={selfReport} />}
          {view === 'purity' && <PurityPage report={selfReport} loading={selfLoading} />}
          {view === 'dns-leak' && <DnsLeakPage />}
          {view === 'webrtc' && <WebRtcPage />}
          {view === 'ipv6' && <Ipv6Page />}
          {view === 'dns-lookup' && <DnsLookupPage />}
          {view === 'rdap' && <RdapPage selfReport={selfReport} />}
          {view === 'cidr' && <CidrPage />}
          {view === 'network' && <NetworkPage />}
          <footer className="page-footer"><span>IP RADAR · NETWORK INTELLIGENCE CENTER</span><span>检测结果仅供网络诊断参考，不构成安全认证或匿名性保证。</span></footer>
        </div>
      </main>
    </div>
  );
}

function viewFromHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, '') as View;
  return hash in VIEW_META ? hash : 'overview';
}

function Dashboard({ report, loading, message, navigate }: { report: IpReport | null; loading: boolean; message: string; navigate: (view: View) => void }) {
  const score = report?.assessment?.score;
  const scoreReady = score !== undefined && score >= 0;
  const riskLabel = report?.assessment?.level ?? '待检测';
  const location = formatLocation(report);
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (!report?.ip) return;
    await copyText(report.ip);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return <div className="dashboard-grid">
    <section className="hero-card panel">
      <div className="hero-grid-bg" />
      <div className="hero-topline"><div className="hero-kicker"><span className="live-pulse" /> YOUR PUBLIC IP ADDRESS</div><span className="hero-tag">LIVE SESSION <span>●</span></span></div>
      <div className="hero-main">
        <div className="hero-ip-block">
          <div className="hero-ip-label">当前公网出口 IP</div>
          <div className="hero-ip-line"><div className="hero-ip">{loading ? <span className="skeleton skeleton-ip" /> : report?.ip ?? '等待部署'}</div>{report?.ip && <button className="copy-ip" onClick={() => void doCopy()} title="复制 IP">{copied ? <Check size={17} /> : <Copy size={17} />}</button>}</div>
          <div className="hero-meta"><span><MapPin size={14} /> {loading ? '识别中…' : location}</span><span><Server size={14} /> {report?.company ?? message}</span></div>
        </div>
        <div className="radar-art" aria-hidden="true"><div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-ring ring-three" /><div className="radar-sweep" /><div className="radar-core"><Radar size={34} /></div><i className="radar-point point-a" /><i className="radar-point point-b" /><i className="radar-point point-c" /></div>
      </div>
      <div className="hero-bottom"><div className="hero-state"><CheckCircle2 size={16} /> {report ? '出口识别完成' : loading ? '正在连接检测节点' : '等待 Cloudflare 部署后自动识别'}</div><div className="hero-right-note">数据源：{report?.source ?? 'Cloudflare Visitor Metadata'}</div></div>
    </section>

    <section className="panel score-panel">
      <div className="panel-heading"><div><span className="panel-eyebrow">IP REPUTATION</span><h2>IP 风险评估</h2></div><ShieldCheck size={19} className="muted-icon" /></div>
      <div className="score-content"><div className={`score-ring ${scoreReady ? 'score-ready' : ''}`} style={{ '--score': `${score !== undefined && score >= 0 ? score : 0}%` } as CSSProperties}><div className="score-ring-inner"><strong>{scoreReady ? score : '—'}</strong><small>/ 100</small></div></div><div className="score-summary"><strong>{riskLabel}</strong><p>{report?.assessment?.confidenceLabel ?? '需要完成 IP 情报查询后生成评估'}</p></div></div>
      <div className="score-footer"><span>检测可信度</span><span className={`confidence ${report?.assessment?.securityAvailable ? 'good' : 'limited'}`}>{report?.assessment?.securityAvailable ? '情报完整' : report ? '基础参考' : '未检测'}</span></div>
    </section>

    <section className="metric-grid">
      <MetricCard icon={<Globe size={18} />} label="IP 协议" value={report?.ip?.includes(':') ? 'IPv6' : report?.ip ? 'IPv4' : '待识别'} note="公网出口协议" tone="cyan" />
      <MetricCard icon={<Router size={18} />} label="网络归属" value={report?.assessment?.networkType ?? '待识别'} note={report?.asn ?? 'ASN / ISP'} tone="violet" />
      <MetricCard icon={<MapPin size={18} />} label="出口位置" value={report?.country || '待识别'} note={location} tone="blue" />
      <MetricCard icon={<Shield size={18} />} label="风险状态" value={riskLabel} note={report?.assessment?.reasons?.length ? `${report.assessment.reasons.length} 项风险信号` : '等待安全情报'} tone="green" />
    </section>

    <section className="panel module-panel"><div className="section-title-row"><div><span className="panel-eyebrow">QUICK DIAGNOSTICS</span><h2>隐私与网络检测</h2></div><button className="text-link" onClick={() => navigate('dns-leak')}>进入检测中心 <ArrowRight size={14} /></button></div>
      <div className="module-grid">
        <ModuleCard icon={<Database size={19} />} title="DNS 泄露检测" desc="观察实际递归 DNS 解析器出口" tag="需配置权威探针" onClick={() => navigate('dns-leak')} />
        <ModuleCard icon={<Fingerprint size={19} />} title="WebRTC 泄露" desc="检查浏览器 ICE 地址候选" tag="浏览器本地检测" onClick={() => navigate('webrtc')} />
        <ModuleCard icon={<Network size={19} />} title="IPv6 泄露检测" desc="分别验证 IPv4 与 IPv6 出口" tag="双栈连通检测" onClick={() => navigate('ipv6')} />
        <ModuleCard icon={<Activity size={19} />} title="网络质量检测" desc="测量本站边缘节点响应速度" tag="点击开始测试" onClick={() => navigate('network')} />
      </div>
    </section>

    <section className="panel detail-panel"><div className="section-title-row"><div><span className="panel-eyebrow">CONNECTION DETAILS</span><h2>网络出口信息</h2></div><button className="icon-button" title="查询 IP" onClick={() => navigate('ip')}><ArrowUpRight size={18} /></button></div>
      <div className="detail-list"><DetailRow label="公网 IP" value={report?.ip ?? '—'} mono /><DetailRow label="运营商 / 组织" value={report?.company ?? '—'} /><DetailRow label="ASN" value={report?.asn ?? '—'} mono /><DetailRow label="地理位置" value={location} /><DetailRow label="时区" value={report?.timezone ?? '—'} /></div>
      {report?.enrichmentError && <div className="inline-warning"><Info size={14} /> {report.enrichmentError}</div>}
    </section>

    <section className="panel privacy-note"><div className="privacy-icon"><ShieldCheck size={20} /></div><div><strong>隐私说明</strong><p>本工具不会在浏览器中保存你的 IP 查询历史。IP 情报查询会将目标 IP 发送给配置的数据服务商；DNS 探测会生成随机测试域名。请在公开部署前阅读 README 中的隐私与数据源说明。</p></div></section>
  </div>;
}

function MetricCard({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className="metric-card panel"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function ModuleCard({ icon, title, desc, tag, onClick }: { icon: ReactNode; title: string; desc: string; tag: string; onClick: () => void }) {
  return <button className="module-card" onClick={onClick}><div className="module-card-icon">{icon}</div><div className="module-card-body"><strong>{title}</strong><p>{desc}</p><span>{tag}</span></div><ChevronRight size={16} className="module-arrow" /></button>;
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="detail-row"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>;
}

function SectionPanel({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel section-panel"><div className="section-title-row"><div>{eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}

function IpLookupPage({ selfReport }: { selfReport: IpReport | null }) {
  const [ip, setIp] = useState(selfReport?.ip ?? '');
  const [result, setResult] = useState<IpReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!ip && selfReport?.ip) setIp(selfReport.ip); }, [selfReport, ip]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try { setResult(await lookupIp(ip.trim())); } catch (err) { setError(err instanceof Error ? err.message : '查询失败'); }
    finally { setBusy(false); }
  };
  return <div className="content-grid"><SectionPanel title="查询任意 IP 地址" eyebrow="IP LOOKUP"><form className="search-form" onSubmit={submit}><div className="input-wrap"><Search size={17} /><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="输入 IPv4 或 IPv6，例如 1.1.1.1" spellCheck={false} /><button type="button" className="input-suffix" onClick={() => setIp(selfReport?.ip ?? '')}>使用当前 IP</button></div><button className="button button-primary" disabled={busy || !ip.trim()}>{busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />} 开始查询</button></form><p className="helper-text">支持 IPv4 / IPv6。查询会调用服务端配置的 IP 情报数据源；第三方免费额度可能有限。</p>{error && <div className="error-banner"><ShieldAlert size={16} /> {error}</div>}{result && <IpResult report={result} />}</SectionPanel><SectionPanel title="查询说明" eyebrow="DATA NOTES"><InfoList items={[['IP 归属地','基于 IP 注册、路由及地理定位数据，位置通常为近似值。'],['ASN / ISP','展示公开 BGP 网络归属信息，不等同于实际接入线路。'],['代理与 VPN','需要启用具有安全检测字段的 API Key，匿名数据不会提供完整风险标志。'],['结果时效','不同数据源更新频率不同，家庭宽带动态 IP 可能发生变化。']]} /></SectionPanel></div>;
}

function IpResult({ report }: { report: IpReport }) {
  return <div className="result-card"><div className="result-header"><div><div className="panel-eyebrow">LOOKUP RESULT</div><div className="result-ip mono">{report.ip}</div></div><BadgeCheck size={22} className="success-icon" /></div><div className="result-grid"><DetailRow label="国家 / 地区" value={report.country || '—'} /><DetailRow label="城市 / 区域" value={[report.city, report.region].filter(Boolean).join(' / ') || '—'} /><DetailRow label="组织 / ISP" value={report.company || '—'} /><DetailRow label="ASN" value={report.asn || '—'} mono /><DetailRow label="时区" value={report.timezone || '—'} /><DetailRow label="网络类型" value={report.assessment.networkType} /></div><RiskFlags report={report} /></div>;
}

function RiskFlags({ report }: { report: IpReport }) {
  const flags = [{ label: 'VPN', value: report.isVpn }, { label: 'Proxy', value: report.isProxy }, { label: 'Tor', value: report.isTor }, { label: '数据中心', value: report.isDatacenter }, { label: '滥用情报', value: report.isAbuser }, { label: '移动网络', value: report.isMobile }, { label: '卫星网络', value: report.isSatellite }, { label: 'Anycast', value: report.isAnycast }, { label: '爬虫网络', value: report.isCrawler }];
  return <div className="flag-list">{flags.map((flag) => <span className={`flag-chip ${flag.value ? 'flag-warn' : 'flag-neutral'}`} key={flag.label}><span />{flag.label}：{report.assessment.securityAvailable ? (flag.value ? '命中' : '未命中') : '未知'}</span>)}</div>;
}

function PurityPage({ report, loading }: { report: IpReport | null; loading: boolean }) {
  const score = report?.assessment.score;
  const scoreReady = score !== undefined && score >= 0;
  const reasons = report?.assessment.reasons ?? [];
  return <div className="content-grid"><SectionPanel title="当前出口 IP 风险概览" eyebrow="REPUTATION SCORE"><div className="purity-hero"><div className={`score-ring large ${scoreReady ? 'score-ready' : ''}`} style={{ '--score': `${score !== undefined && score >= 0 ? score : 0}%` } as CSSProperties}><div className="score-ring-inner"><strong>{scoreReady ? score : loading ? '…' : '—'}</strong><small>/ 100</small></div></div><div className="purity-summary"><div className="panel-eyebrow">CURRENT EXIT IP</div><div className="result-ip mono">{report?.ip ?? '尚未识别'}</div><h3>{report?.assessment.level ?? '等待 IP 情报'}</h3><p>{report?.assessment.confidenceLabel ?? '请先部署到 Cloudflare，以自动识别访客公网 IP。'}</p><span className={`confidence ${report?.assessment.securityAvailable ? 'good' : 'limited'}`}>{report?.assessment.securityAvailable ? '安全检测字段已启用' : '基础参考评分 / 低可信度'}</span></div></div><div className="score-scale"><span>高风险</span><div className="score-track"><i /></div><span>低风险</span></div></SectionPanel><SectionPanel title="风险信号" eyebrow="DETECTION SIGNALS"><div className="risk-signal-list">{reasons.length ? reasons.map((reason) => <div className="risk-signal" key={reason}><ShieldAlert size={16} /><span>{reason}</span></div>) : <div className="empty-state compact"><ShieldCheck size={23} /><strong>{report?.assessment.securityAvailable ? '暂未发现已知风险标志' : '暂无可用的安全情报标志'}</strong><p>{report ? '当前 IP 情报服务未提供完整 VPN / Proxy / Tor 检测字段。' : '请等待当前 IP 识别完成。'}</p></div>}</div><div className="notice-box"><Info size={17} /><div><strong>评分解释</strong><p>评分是本站基于第三方公开情报的参考指标，不代表 IP 一定“纯净”。住宅代理、动态代理、未知 VPN 和新出现的滥用节点可能未被数据源收录。请不要将评分用于重要风控决策。</p></div></div></SectionPanel><SectionPanel title="情报字段状态" eyebrow="DATA COVERAGE"><div className="coverage-grid"><CoverageItem title="IP 归属 / ASN" ok={Boolean(report?.asn && report.asn !== '未知')} /><CoverageItem title="地理位置" ok={Boolean(report?.country)} /><CoverageItem title="VPN / Proxy / Tor" ok={Boolean(report?.assessment.securityAvailable)} /><CoverageItem title="滥用记录" ok={Boolean(report?.assessment.securityAvailable)} /></div></SectionPanel></div>;
}

function CoverageItem({ title, ok }: { title: string; ok: boolean }) {
  return <div className="coverage-item"><span className={ok ? 'coverage-ok' : 'coverage-pending'}>{ok ? <CheckCircle2 size={16} /> : <Info size={16} />}</span><span>{title}</span><strong>{ok ? '可用' : '未启用 / 未知'}</strong></div>;
}

function InfoList({ items }: { items: [string, string][] }) {
  return <div className="info-list">{items.map(([title, desc]) => <div className="info-list-item" key={title}><div><strong>{title}</strong><p>{desc}</p></div><ChevronRight size={16} /></div>)}</div>;
}

function DnsLeakPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('正在读取 DNS 探针配置…');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ received: number; resolvers: Array<{ ip: string; queryCount: number; queries: string[] }>; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { void checkDnsStatus().then((status) => { setConfigured(status.configured); setDomain(status.domain ?? ''); setNote(status.note); }).catch((err) => { setConfigured(false); setNote(err instanceof Error ? err.message : '无法读取配置'); }); }, []);

  const run = async () => {
    setBusy(true); setError(''); setResult(null); setProgress('正在生成随机 DNS 探测域名…');
    try {
      const probe = await startDnsProbe();
      if (!probe.id || !probe.hosts?.length) throw new Error(probe.error?.message ?? 'DNS 探针未正确配置。');
      setProgress('正在通过当前网络解析 5 个一次性子域名…');
      await Promise.allSettled(probe.hosts.map((host) => fetch(`https://${host}/probe`, { method: 'GET', mode: 'cors', cache: 'no-store' })));
      setProgress('已触发 DNS 查询，正在等待权威 DNS 分析数据…');
      let latest: Awaited<ReturnType<typeof getDnsResults>> | null = null;
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        latest = await getDnsResults(probe.id);
        if (latest.received > 0) break;
      }
      if (latest) setResult(latest);
      if (!latest?.received) setProgress('没有观察到探测记录。DNS 分析数据可能尚未入库，请稍后再试。');
      else setProgress('探测完成');
    } catch (err) { setError(err instanceof Error ? err.message : 'DNS 探测失败'); setProgress(''); }
    finally { setBusy(false); }
  };

  return <div className="content-grid"><SectionPanel title="递归 DNS 出口探测" eyebrow="AUTHORITATIVE DNS PROBE" action={<span className={`confidence ${configured ? 'good' : 'limited'}`}>{configured ? '已配置' : '待配置'}</span>}><div className="dns-method"><div className="dns-method-icon"><Database size={23} /></div><div><strong>一次性子域名 + 权威 DNS 分析</strong><p>浏览器访问每次随机生成的探测域名，Cloudflare 权威 DNS Analytics 记录递归解析器请求来源，再由本站汇总解析器出口 IP。</p></div></div>{domain && <div className="config-domain"><span>当前探测域名</span><code>{domain}</code></div>}{!configured && <div className="notice-box warning"><Info size={17} /><div><strong>尚未配置真实 DNS 探针</strong><p>{note} 详细步骤见 README →「DNS 泄露检测配置」。未配置前不会显示伪造解析器或假检测结果。</p></div></div>}{configured && <div className="notice-box"><CheckCircle2 size={17} /><div><strong>基础配置已检测到</strong><p>{note} 还需确认通配符 DNS 已开启代理，并将探针子域名路由到本 Worker。</p></div></div>}<button className="button button-primary button-wide" disabled={!configured || busy} onClick={() => void run()}>{busy ? <><Loader2 size={16} className="spin" /> 正在检测</> : <><Radar size={17} /> 开始 DNS 泄露检测</>}</button>{busy && <div className="progress-line"><span className="progress-animated" /><p>{progress}</p></div>}{error && <div className="error-banner"><ShieldAlert size={16} /> {error}</div>}{result && <div className="dns-results"><div className="result-header"><div><span className="panel-eyebrow">OBSERVED RESOLVERS</span><div className="result-ip">检测到 {result.resolvers.length} 个解析器出口</div></div><span className={`result-pill ${result.received ? 'pill-good' : 'pill-warn'}`}>{result.received ? '已获取证据' : '暂无记录'}</span></div><p className="helper-text">{result.message}</p>{result.resolvers.map((resolver) => <div className="resolver-row" key={resolver.ip}><div className="resolver-icon"><Server size={16} /></div><div><strong className="mono">{resolver.ip}</strong><small>观察到 {resolver.queryCount} 次权威 DNS 查询</small></div><button className="icon-button" onClick={() => void copyText(resolver.ip)} title="复制"><Copy size={15} /></button></div>)}</div>}</SectionPanel><SectionPanel title="结果如何判断" eyebrow="HOW TO READ"><InfoList items={[['观察到的解析器','显示向本站权威 DNS 发起递归查询的出口地址，不一定等同于你在系统里手动填写的 DNS 地址。'],['是否构成泄露','需要将解析器所属 ISP / ASN 与预期 VPN 或代理服务商的网络出口进行比对。'],['数据延迟','Cloudflare DNS Analytics 的统计数据可能有入库延迟，测试刚结束没有记录不代表没有 DNS 查询。'],['检测边界','DoH、DoT、企业 DNS 转发和解析器 Anycast 都会影响最终观测结果。']]} /></SectionPanel></div>;
}

function WebRtcPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ ip: string; type: string; privacy: string }>>([]);
  const [message, setMessage] = useState('点击开始检测，浏览器将创建一个临时 WebRTC 连接。');
  const run = async () => {
    setBusy(true); setDone(false); setCandidates([]); setMessage('正在收集 ICE 候选地址…');
    let pc: RTCPeerConnection | null = null;
    try {
      if (!window.RTCPeerConnection) throw new Error('当前浏览器不支持 WebRTC。');
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('ip-radar-probe');
      const found: Array<{ ip: string; type: string; privacy: string }> = [];
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const parts = event.candidate.candidate.split(' ');
        const ip = parts[4] ?? '';
        const typeIndex = parts.indexOf('typ');
        const type = typeIndex >= 0 ? (parts[typeIndex + 1] ?? 'unknown') : 'unknown';
        if (!ip || ip.endsWith('.local') || found.some((item) => item.ip === ip)) return;
        found.push({ ip, type, privacy: isPrivateIp(ip) ? '本地 / 私有地址' : '公网候选地址' });
        setCandidates([...found]);
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise((resolve) => window.setTimeout(resolve, 8000));
      setCandidates(found);
      setMessage(found.length ? 'ICE 候选收集完成。请重点关注与当前代理出口不一致的公网地址。' : '没有收集到可显示的 IP 候选地址。浏览器可能隐藏了本地地址，或 STUN 服务不可达。');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'WebRTC 检测失败');
    } finally { pc?.close(); setBusy(false); setDone(true); }
  };
  return <div className="content-grid"><SectionPanel title="浏览器 ICE 地址检查" eyebrow="WEBRTC PRIVACY"><div className="webrtc-hero"><div className="webrtc-visual"><Fingerprint size={44} strokeWidth={1.3} /><div className="webrtc-orbit" /></div><div><strong>检查浏览器可能暴露的 IP 地址</strong><p>检测会创建一个临时 RTCPeerConnection，并请求公开 STUN 服务收集 ICE 候选项。不会请求麦克风或摄像头权限。</p></div></div><button className="button button-primary button-wide" onClick={() => void run()} disabled={busy}>{busy ? <><Loader2 size={16} className="spin" /> 正在收集候选地址</> : <><Fingerprint size={16} /> {done ? '重新检测 WebRTC' : '开始 WebRTC 检测'}</>}</button><div className="test-status"><span className={busy ? 'status-processing' : done ? 'status-complete' : 'status-idle'} />{message}</div>{candidates.length > 0 && <div className="candidate-list">{candidates.map((candidate) => <div className="candidate-row" key={candidate.ip}><span className={`candidate-dot ${candidate.privacy.includes('公网') ? 'warn' : ''}`} /><div><strong className="mono">{candidate.ip}</strong><small>{candidate.privacy} · ICE {candidate.type}</small></div><span className="candidate-type">{candidate.type}</span></div>)}</div>}{done && candidates.length === 0 && <div className="notice-box"><Info size={16} /><div><strong>没有发现可见 IP 候选</strong><p>这不等于绝对没有 WebRTC 泄露。不同浏览器、操作系统和代理策略可能会隐藏或过滤候选地址。</p></div></div>}</SectionPanel><SectionPanel title="检测说明" eyebrow="IMPORTANT"><InfoList items={[['公网候选地址','通常以 srflx 类型出现，反映 STUN 服务器观察到的出口地址。'],['本地候选地址','可能是私有网段地址，也可能被浏览器替换成 .local mDNS 名称。'],['代理一致性','请将候选公网地址与左侧导航中的当前公网 IP 进行比较。'],['浏览器差异','浏览器版本、隐私保护设置、VPN 客户端和企业策略都会影响检测结果。']]} /></SectionPanel></div>;
}

function Ipv6Page() {
  const [busy, setBusy] = useState(false);
  const [ipv4, setIpv4] = useState('');
  const [ipv6, setIpv6] = useState('');
  const [message, setMessage] = useState('尚未开始检测');
  const run = async () => {
    setBusy(true); setIpv4(''); setIpv6(''); setMessage('正在分别请求 IPv4 和 IPv6 检测端点…');
    const read = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { ip?: string };
      return data.ip ?? '';
    };
    const [v4, v6] = await Promise.allSettled([read('https://api.ipify.org?format=json'), read('https://api6.ipify.org?format=json')]);
    setIpv4(v4.status === 'fulfilled' ? v4.value : '不可达');
    setIpv6(v6.status === 'fulfilled' ? v6.value : '未检测到 / 不可达');
    setMessage('检测完成。请确认 IPv6 出口是否符合你预期的 VPN / 代理网络。');
    setBusy(false);
  };
  const hasV6 = ipv6 && ipv6 !== '未检测到 / 不可达';
  return <div className="content-grid"><SectionPanel title="双栈出口检测" eyebrow="IPV4 / IPV6"><div className="dual-stack-grid"><div className="stack-card"><div className="stack-top"><span className="protocol-pill">IPv4</span><Globe size={18} /></div><strong className="mono stack-ip">{ipv4 || (busy ? '检测中…' : '—')}</strong><small>{ipv4 && ipv4 !== '不可达' ? 'IPv4 公网连通' : ipv4 ? '无法连接 IPv4 检测端点' : '等待检测'}</small></div><div className="stack-card"><div className="stack-top"><span className="protocol-pill ipv6-pill">IPv6</span><Network size={18} /></div><strong className="mono stack-ip">{ipv6 || (busy ? '检测中…' : '—')}</strong><small>{hasV6 ? '检测到 IPv6 出口' : ipv6 ? '未检测到 IPv6 出口' : '等待检测'}</small></div></div><button className="button button-primary button-wide" disabled={busy} onClick={() => void run()}>{busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} {busy ? '检测中…' : '开始 IPv4 / IPv6 检测'}</button><div className="test-status"><span className={busy ? 'status-processing' : 'status-idle'} />{message}</div>{hasV6 && <div className="notice-box warning"><ShieldAlert size={17} /><div><strong>检测到 IPv6 公网出口</strong><p>如果你的代理工具只接管 IPv4，IPv6 可能绕过代理直连。请检查代理客户端的 IPv6 设置或系统网络配置。</p></div></div>}</SectionPanel><SectionPanel title="如何理解结果" eyebrow="INTERPRETATION"><InfoList items={[['IPv4 可用','浏览器可以通过 IPv4 访问外部检测服务。'],['IPv6 可用','浏览器可以通过 IPv6 访问 IPv6 专用检测端点。'],['可能存在泄露','若你期望所有流量都经 VPN / 代理，IPv6 直连可能暴露真实网络出口。'],['注意事项','结果受网络、浏览器策略、DNS 和第三方检测端点可用性影响。']]} /></SectionPanel></div>;
}

function DnsLookupPage() {
  const [domain, setDomain] = useState('example.com');
  const [type, setType] = useState('A');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Array<{ name: string; type: number; TTL: number; data: string }>>([]);
  const [error, setError] = useState('');
  const types = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'CAA', 'SOA'];
  const run = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setAnswers([]);
    try {
      const target = domain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
      if (!target || !/^[a-zA-Z0-9.-]+$/.test(target) || target.includes('..')) throw new Error('请输入有效域名，不要包含路径。');
      const url = new URL('https://cloudflare-dns.com/dns-query'); url.searchParams.set('name', target); url.searchParams.set('type', type);
      const response = await fetch(url, { headers: { accept: 'application/dns-json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`DNS 服务返回 HTTP ${response.status}`);
      const data = await response.json() as { Status?: number; Answer?: Array<{ name: string; type: number; TTL: number; data: string }> };
      if (data.Status && data.Status !== 0) throw new Error(`DNS 响应状态码：${data.Status}（0 表示成功，3 表示域名不存在）`);
      setAnswers(data.Answer ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : 'DNS 查询失败'); }
    finally { setBusy(false); }
  };
  return <div className="content-grid"><SectionPanel title="公共 DNS 查询" eyebrow="DNS OVER HTTPS"><form className="stacked-form" onSubmit={run}><label>查询域名</label><div className="input-wrap"><Globe size={17} /><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /></div><label>记录类型</label><div className="type-selector">{types.map((item) => <button type="button" key={item} className={type === item ? 'type-active' : ''} onClick={() => setType(item)}>{item}</button>)}</div><button className="button button-primary" disabled={busy || !domain.trim()}>{busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />} 查询 DNS 记录</button></form>{error && <div className="error-banner"><Info size={16} /> {error}</div>}{answers.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>名称</th><th>TTL</th><th>记录值</th></tr></thead><tbody>{answers.map((answer, index) => <tr key={`${answer.name}-${index}`}><td className="mono">{answer.name}</td><td>{answer.TTL}s</td><td className="mono break-all">{answer.data}</td></tr>)}</tbody></table></div>}{!busy && !error && answers.length === 0 && <div className="empty-state"><Database size={25} /><strong>等待查询</strong><p>选择记录类型并输入域名开始解析。</p></div>}</SectionPanel><SectionPanel title="DNS 查询说明" eyebrow="ABOUT DOH"><InfoList items={[['使用服务','查询通过 Cloudflare 公共 DNS over HTTPS 完成。'],['记录类型','A / AAAA 对应 IP 地址，MX 邮件交换，TXT 文本，NS 权威名称服务器。'],['隐私提示','查询域名会发送给 Cloudflare DNS 服务；请勿输入敏感内部域名。'],['解析位置','公共 DNS 查询结果可能受缓存、地理调度和分流策略影响。']]} /></SectionPanel></div>;
}

function RdapPage({ selfReport }: { selfReport: IpReport | null }) {
  const [ip, setIp] = useState(selfReport?.ip ?? '1.1.1.1');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const run = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setData(null);
    try { const result = await lookupRdap(ip.trim()); setData(result.data); }
    catch (err) { setError(err instanceof Error ? err.message : 'RDAP 查询失败'); }
    finally { setBusy(false); }
  };
  const entities = Array.isArray(data?.entities) ? data.entities as Array<Record<string, unknown>> : [];
  const events = Array.isArray(data?.events) ? data.events as Array<Record<string, unknown>> : [];
  return <div className="content-grid"><SectionPanel title="IP 注册信息查询" eyebrow="RDAP LOOKUP"><form className="search-form" onSubmit={run}><div className="input-wrap"><Search size={17} /><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP 地址" spellCheck={false} /></div><button className="button button-primary" disabled={busy || !ip.trim()}>{busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />} 查询注册信息</button></form><p className="helper-text">通过公共 RDAP 引导服务查询区域互联网注册机构信息。</p>{error && <div className="error-banner"><Info size={16} /> {error}</div>}{data && <div className="rdap-result"><div className="result-grid"><DetailRow label="名称" value={String(data.name ?? '—')} /><DetailRow label="句柄" value={String(data.handle ?? '—')} mono /><DetailRow label="对象类别" value={String(data.objectClassName ?? '—')} /><DetailRow label="国家 / 地区" value={String(data.country ?? '—')} /><DetailRow label="网络范围" value={`${data.startAddress ?? '—'} — ${data.endAddress ?? '—'}`} mono /><DetailRow label="父级句柄" value={String(data.parentHandle ?? '—')} mono /></div>{events.length > 0 && <><h3 className="subsection-title">注册事件</h3>{events.slice(0, 6).map((item, index) => <div className="event-row" key={index}><span>{String(item.eventAction ?? '事件')}</span><strong>{String(item.eventDate ?? '')}</strong></div>)}</>}{entities.length > 0 && <><h3 className="subsection-title">关联注册机构</h3>{entities.slice(0, 5).map((item, index) => <div className="event-row" key={index}><span>{String(item.handle ?? item.roles ?? 'Entity')}</span><strong>{String(item.objectClassName ?? '实体')}</strong></div>)}</>}</div>}{!data && !error && <div className="empty-state"><FileSearch size={25} /><strong>等待查询</strong><p>输入需要查询的 IP 地址。</p></div>}</SectionPanel><SectionPanel title="RDAP 与 WHOIS" eyebrow="REGISTRY DATA"><InfoList items={[['RDAP','基于 HTTPS 和结构化 JSON 的注册数据访问协议。'],['注册信息','IP 网络范围、注册机构和部分注册事件会因 RIR 而不同。'],['数据边界','注册组织不一定是实际提供互联网接入服务的 ISP。'],['隐私','部分个人信息可能被注册机构隐藏或脱敏。']]} /></SectionPanel></div>;
}

function CidrPage() {
  const [ip, setIp] = useState('192.168.1.100');
  const [prefix, setPrefix] = useState('24');
  const [result, setResult] = useState<ReturnType<typeof calculateCidr> | null>(null);
  const [error, setError] = useState('');
  const run = (event: FormEvent) => { event.preventDefault(); try { setResult(calculateCidr(ip.trim(), prefix)); setError(''); } catch (err) { setResult(null); setError(err instanceof Error ? err.message : '计算失败'); } };
  return <div className="content-grid"><SectionPanel title="IPv4 子网计算" eyebrow="CIDR CALCULATOR"><form className="cidr-form" onSubmit={run}><div className="field-row"><div className="field-grow"><label>IPv4 地址</label><div className="input-wrap"><Globe size={17} /><input value={ip} onChange={(e) => setIp(e.target.value)} /></div></div><div className="prefix-field"><label>CIDR 前缀</label><div className="input-wrap"><span className="prefix-mark">/</span><input type="number" min="0" max="32" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div></div></div><button className="button button-primary"><Activity size={16} /> 计算子网</button></form>{error && <div className="error-banner"><Info size={16} /> {error}</div>}{result && <div className="cidr-result"><div className="cidr-main"><span>NETWORK ADDRESS</span><strong className="mono">{result.network}/{result.prefix}</strong></div><div className="result-grid"><DetailRow label="子网掩码" value={result.mask} mono /><DetailRow label="通配符掩码" value={result.wildcard} mono /><DetailRow label="广播地址" value={result.broadcast} mono /><DetailRow label="第一个可用地址" value={result.firstHost} mono /><DetailRow label="最后一个可用地址" value={result.lastHost} mono /><DetailRow label="地址总数" value={result.total.toLocaleString()} /><DetailRow label="可用主机数" value={result.usable.toLocaleString()} /></div></div>}</SectionPanel><SectionPanel title="CIDR 前缀速查" eyebrow="QUICK REFERENCE"><div className="cidr-reference">{[['/24','255.255.255.0','254'],['/25','255.255.255.128','126'],['/26','255.255.255.192','62'],['/27','255.255.255.224','30'],['/28','255.255.255.240','14'],['/29','255.255.255.248','6'],['/30','255.255.255.252','2'],['/31','255.255.255.254','2'],['/32','255.255.255.255','1']].map(([cidr, mask, hosts]) => <div className="cidr-ref-row" key={cidr}><strong>{cidr}</strong><span className="mono">{mask}</span><span>{hosts} 地址</span></div>)}</div></SectionPanel></div>;
}

function NetworkPage() {
  const [busy, setBusy] = useState(false);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [download, setDownload] = useState<number | null>(null);
  const [downloadSize, setDownloadSize] = useState(0);
  const [error, setError] = useState('');
  const average = latencies.length ? latencies.reduce((sum, item) => sum + item, 0) / latencies.length : 0;
  const run = async () => {
    setBusy(true); setError(''); setLatencies([]); setDownload(null); setDownloadSize(0);
    try {
      const values: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const start = performance.now();
        const response = await fetch(`/api/health?t=${Date.now()}-${i}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`本站检测端点返回 HTTP ${response.status}`);
        await response.json(); values.push(performance.now() - start); setLatencies([...values]);
      }
      try {
        const start = performance.now();
        const response = await fetch('https://speed.cloudflare.com/__down?bytes=2000000', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('下载测速端点暂不可用');
        const buffer = await response.arrayBuffer();
        const seconds = (performance.now() - start) / 1000;
        setDownload((buffer.byteLength * 8 / 1_000_000) / seconds);
        setDownloadSize(buffer.byteLength);
      } catch { setError('延迟测试已完成；下载测速端点暂不可用或被当前网络拦截。'); }
    } catch (err) { setError(err instanceof Error ? err.message : '网络检测失败'); }
    finally { setBusy(false); }
  };
  return <div className="content-grid"><SectionPanel title="边缘网络延迟测试" eyebrow="EDGE LATENCY"><div className="network-score"><div><span className="panel-eyebrow">平均往返延迟</span><strong>{latencies.length ? formatMs(average) : '—'}</strong><p>浏览器 → 当前 IP Radar Worker</p></div><div className="latency-bars">{Array.from({ length: 5 }, (_, index) => <i key={index} className={latencies[index] ? 'bar-done' : ''} style={{ height: latencies[index] ? `${Math.max(18, 74 - Math.min(latencies[index], 250) / 4)}%` : '12%' }} />)}</div></div><button className="button button-primary button-wide" disabled={busy} onClick={() => void run()}>{busy ? <Loader2 size={16} className="spin" /> : <Activity size={16} />} {busy ? `测试中 ${latencies.length}/5` : '开始网络质量测试'}</button>{latencies.length > 0 && <div className="latency-list">{latencies.map((value, index) => <div key={index}><span>第 {index + 1} 次</span><strong className="mono">{formatMs(value)}</strong></div>)}</div>}{download !== null && <div className="download-result"><div><span>估算下载吞吐</span><strong>{download.toFixed(2)} Mbps</strong></div><div><span>测试数据量</span><strong>{prettyBytes(downloadSize)}</strong></div></div>}{error && <div className="inline-warning"><Info size={14} /> {error}</div>}</SectionPanel><SectionPanel title="测试数据的含义" eyebrow="TEST SCOPE"><InfoList items={[['往返延迟','仅表示浏览器到本站 Worker 的 HTTPS 请求时间，不等于 ICMP Ping。'],['下载吞吐','从 Cloudflare speed.cloudflare.com 读取约 2 MB 测试数据估算，结果受网络拥塞和缓存影响。'],['节点位置','请求会命中 Cloudflare 边缘网络，不代表目标网站所在地。'],['建议','多次在不同时间测试，并与常用服务的实际访问体验结合判断。']]} /></SectionPanel></div>;
}

export default App;
