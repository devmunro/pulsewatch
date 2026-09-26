"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Bell, Box, Braces, CircleGauge, Cloud, Code2, ExternalLink, GitBranch, Globe2, LayoutDashboard, LockKeyhole, MoreVertical, Radio, Search, Server, Settings, ShieldCheck, Siren, Sun, Webhook } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type View = "landing" | "overview" | "monitors" | "detail" | "incidents" | "alerts" | "status" | "integrations" | "settings";
const monitors = [
  { name: "Portfolio Website", url: "https://davidnunro.dev", uptime: "99.99%", response: "122 ms", checked: "2 min ago" },
  { name: "API Service", url: "https://api.davidnunro.dev", uptime: "99.97%", response: "184 ms", checked: "1 min ago" },
  { name: "Authentication", url: "https://auth.davidnunro.dev", uptime: "99.98%", response: "211 ms", checked: "3 min ago" },
  { name: "Demo Website", url: "https://example.com", uptime: "99.98%", response: "231 ms", checked: "2 min ago" },
];
const chartData = Array.from({ length: 48 }, (_, i) => ({ time: `${String(Math.floor(i / 2)).padStart(2, "0")}:00`, value: Math.round(105 + Math.sin(i * 1.7) * 24 + Math.cos(i * .55) * 18 + ([8, 30, 43].includes(i) ? 230 : 0)) }));
const weekData = Array.from({ length: 50 }, (_, i) => ({ time: `${16 + Math.floor(i / 7)} Sep`, value: Math.round(98 + Math.sin(i * 1.5) * 22 + (i === 27 ? 280 : 0) + (i === 6 ? 100 : 0)) }));
const landingFeatures: Array<[typeof Activity, string, string]> = [[Radio,"Real-time","monitoring"],[ShieldCheck,"Reliable","alerts"],[Box,"Built on","AWS serverless"],[LockKeyhole,"Open source","& customizable"]];
const techItems: Array<[typeof Activity, string, string]> = [[Code2,"AWS Lambda","Serverless functions"],[Webhook,"API Gateway","Secure REST API"],[Server,"DynamoDB","Monitoring data"],[ShieldCheck,"Cognito","Authentication"],[Activity,"EventBridge","Scheduled checks"],[Siren,"SNS","Alert notifications"],[Cloud,"CloudWatch","Logging & metrics"],[GitBranch,"GitHub Actions","CI/CD deployment"]];

function PulseLogo({ inverse = false }: { inverse?: boolean }) { return <div className="brand"><Activity size={28} strokeWidth={1.5}/><strong className={inverse ? "inverse" : ""}>PulseWatch</strong></div> }
function PrimaryButton({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) { return <button onClick={onClick} className={`primary-btn ${className}`}>{children}</button> }

function Landing({ openDemo }: { openDemo: () => void }) {
  const heroArtRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const art = heroArtRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 901px)");
    if (!art || reduceMotion.matches || !desktop.matches) return;

    let frame = 0;
    const updateParallax = () => {
      frame = 0;
      const offset = Math.min(window.scrollY * 0.13, 76);
      art.style.setProperty("--parallax-y", `${offset}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax);
    };

    updateParallax();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <main className="landing">
    <header className="landing-nav"><PulseLogo/><nav aria-label="Main navigation"><a href="#features">Features</a><button onClick={openDemo}>Demo</button><a href="#stack">Tech Stack</a><a href="#docs">Docs</a></nav><div className="nav-actions"><button className="outline-btn" onClick={openDemo}>Sign in</button><PrimaryButton onClick={openDemo}>Try demo <ArrowRight size={17}/></PrimaryButton></div></header>
    <section className="hero"><div className="hero-copy"><h1>Uptime<br/>that works<br/>for <em>builders.</em></h1><p>Monitor your websites and APIs, get real-time alerts when something goes down, and see detailed performance insights.</p><div className="hero-actions"><PrimaryButton onClick={openDemo}>Explore live demo <ArrowRight size={17}/></PrimaryButton><a className="outline-btn" href="https://github.com" target="_blank" rel="noreferrer"><GitBranch size={19}/> View on GitHub</a></div></div><img ref={heroArtRef} className="hero-art" src="/pulsewatch-mountains.png" alt="Engraved alpine mountain landscape with evergreen trees"/></section>
    <section id="features" className="feature-strip">{landingFeatures.map(([Icon,a,b])=><div className="feature" key={a}><Icon size={25}/><span>{a}<br/>{b}</span></div>)}</section>
    <section id="stack" className="tech-section"><div><h2>Built with real-world<br/><em>technologies.</em></h2><p>A modern, serverless application built on AWS with a focus on security, scalability and minimal running costs.</p></div><div className="tech-grid">{techItems.map(([Icon,a,b])=><article key={a}><Icon/><div><strong>{a}</strong><span>{b}</span></div></article>)}</div><div className="demo-cta"><h2>Try the live demo <i>•</i></h2><p>Explore the dashboard and see real monitoring data.<br/>No account required.</p><div><PrimaryButton onClick={openDemo}>Open demo <ArrowRight size={17}/></PrimaryButton><button className="outline-btn" onClick={openDemo}>Create your own account</button></div></div></section>
  </main>
}

const navItems: {id: View; label: string; icon: typeof Activity}[] = [
  {id:"overview",label:"Overview",icon:LayoutDashboard},{id:"monitors",label:"Monitors",icon:CircleGauge},{id:"incidents",label:"Incidents",icon:Siren},{id:"alerts",label:"Alerts",icon:Bell},{id:"status",label:"Status Page",icon:Globe2},{id:"integrations",label:"Integrations",icon:Braces},{id:"settings",label:"Settings",icon:Settings},
];
function AppSidebar({ view, setView }: { view: View; setView: (v: View)=>void }) { return <Sidebar collapsible="offcanvas" className="app-sidebar"><SidebarHeader className="sidebar-head"><button onClick={()=>setView("landing")} aria-label="Return home"><PulseLogo inverse/></button></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{navItems.map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton className="side-link" isActive={view===item.id || (view==="detail"&&item.id==="monitors")} onClick={()=>setView(item.id)}><item.icon/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter><div className="demo-user"><span>G</span><div><strong>Demo Mode</strong><small>Read-only access</small></div></div></SidebarFooter></Sidebar> }
function AppHeader(){return <header className="app-header"><SidebarTrigger/><div className="search"><Search size={17}/><input aria-label="Search" placeholder="Search monitors, incidents..."/></div><button aria-label="Notifications"><Bell size={19}/></button><button aria-label="Theme"><Sun size={19}/></button><span className="avatar">G</span></header>}
function StatusBadge(){return <span className="status"><i/>Operational</span>}
function Chart({ detail=false }:{detail?:boolean}){const data=detail?weekData:chartData;return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:8,right:4,left:-22,bottom:0}}><defs><linearGradient id={detail?"fill-week":"fill-day"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#13814b" stopOpacity={.28}/><stop offset="100%" stopColor="#13814b" stopOpacity={.04}/></linearGradient></defs><CartesianGrid stroke="#e7e4dc" vertical={!detail}/><XAxis dataKey="time" tick={{fontSize:11,fill:"#5f625f"}} tickLine={false} axisLine={false} interval={detail?6:7}/><YAxis tick={{fontSize:11,fill:"#5f625f"}} tickLine={false} axisLine={false} ticks={[0,250,500]} unit=" ms"/><Tooltip contentStyle={{borderRadius:8,border:"1px solid #ddd8cf",fontSize:12}}/><Area type="monotone" dataKey="value" stroke="#0f7a44" strokeWidth={2} fill={`url(#${detail?"fill-week":"fill-day"})`}/></AreaChart></ResponsiveContainer>}
function PageHeading({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

function Overview({ setView }:{setView:(v:View)=>void}){return <div className="page"><span className="demo-pill">● DEMO MODE</span><PageHeading title="Overview" subtitle="A live example of PulseWatch in action. This is a read-only demo."><div className="heading-actions"><span className="all-good">● All systems operational</span><PrimaryButton>Get your own monitors</PrimaryButton></div></PageHeading><div className="stats-grid">{[["4","Monitors"],["99.98%","Uptime (7 days)"],["187 ms","Avg. response time"],["0","Active incidents"]].map(([a,b],i)=><article key={b}><strong className={i===1?"green":""}>{a}</strong><span>{b}</span>{i>0&&i<3?<Activity size={18}/>:null}</article>)}</div><section className="panel chart-panel"><div className="panel-title"><strong>Response time (all monitors)</strong><Select defaultValue="24"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="24">Last 24 hours</SelectItem><SelectItem value="168">Last 7 days</SelectItem></SelectContent></Select></div><div className="chart-wrap"><Chart/></div></section><section><h2 className="section-title">Monitors</h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Response time</th><th>Uptime (7d)</th><th>Last checked</th><th/></tr></thead><tbody>{monitors.map(m=><tr key={m.name} onClick={()=>setView("detail")}><td><strong>{m.name}</strong></td><td><StatusBadge/></td><td>{m.response}</td><td>{m.uptime}</td><td>{m.checked}</td><td><ExternalLink size={15}/></td></tr>)}</tbody></table></div></section></div>}
function MiniChart({index}:{index:number}){const pts=useMemo(()=>Array.from({length:18},(_,i)=>35+Math.sin(i*1.4+index)*9+(i===8+index?20:0)),[index]);return <svg className="mini-chart" viewBox="0 0 180 48" preserveAspectRatio="none"><path d={`M0,48 L${pts.map((v,i)=>`${i*10.6},${48-v}`).join(" L")} L180,48 Z`} fill="#dceee1"/><polyline points={pts.map((v,i)=>`${i*10.6},${48-v}`).join(" ")} fill="none" stroke="#18804d" strokeWidth="1.5"/></svg>}
function Monitors({setView}:{setView:(v:View)=>void}){return <div className="page"><PageHeading title="Monitors" subtitle="Websites and APIs being monitored in this demo."><PrimaryButton>Get started <ArrowRight size={16}/></PrimaryButton></PageHeading><div className="monitor-grid">{monitors.map((m,i)=><article className="monitor-card" key={m.name} onClick={()=>setView("detail")}><div className="monitor-title"><strong>{m.name}</strong><MoreVertical size={18}/></div><a>{m.url} <ExternalLink size={12}/></a><MiniChart index={i}/><div className="monitor-metrics"><span><strong>{m.uptime}</strong><small>Uptime (7d)</small></span><span><strong>{m.response}</strong><small>Response time</small></span><span><strong>{m.checked}</strong><small>Last checked</small></span></div></article>)}</div></div>}
function Detail({setView}:{setView:(v:View)=>void}){return <div className="page detail-page"><button className="back" onClick={()=>setView("monitors")}><ArrowLeft size={15}/> Back to monitors</button><PageHeading title="Portfolio Website" subtitle="https://davidnunro.dev ↗"><div className="heading-actions"><StatusBadge/><PrimaryButton>View status page <ArrowRight size={15}/></PrimaryButton></div></PageHeading><Tabs defaultValue="overview"><TabsList variant="line" className="detail-tabs">{["Overview","Response time","Incidents","Settings"].map(x=><TabsTrigger value={x.toLowerCase()} key={x}>{x}</TabsTrigger>)}</TabsList></Tabs><section className="panel chart-panel"><div className="panel-title"><strong>Response time</strong><Select defaultValue="7"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem></SelectContent></Select></div><div className="chart-wrap detail-chart"><Chart detail/></div></section><div className="detail-stats">{[["99.99%","Uptime (7 days)"],["122 ms","Average response time"],["2 min ago","Last checked"],["200","Last status code"]].map(([a,b])=><article key={b}><strong>{a}</strong><span>{b}</span></article>)}</div></div>}
function Incidents(){const rows=[["18 Sep 2026, 14:21","API Service","Slow response time (> 2s)","12 minutes"],["15 Sep 2026, 09:17","Demo Website","Site was down (HTTP 500)","8 minutes"],["12 Sep 2026, 03:44","Authentication","High response time","22 minutes"],["10 Sep 2026, 16:03","API Service","Site was down (HTTP 503)","5 minutes"]];return <div className="page"><PageHeading title="Incidents" subtitle="A history of downtime and performance issues."><Select defaultValue="all"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All monitors</SelectItem>{monitors.map(m=><SelectItem value={m.name} key={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></PageHeading><div className="table-wrap incidents-table"><table><thead><tr><th>Time</th><th>Monitor</th><th>Issue</th><th>Duration</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}>{r.map((c,i)=><td key={c}>{c}{i===2&&r[2].includes("down")?<ExternalLink size={11}/>:null}</td>)}<td><span className="resolved">Resolved</span></td></tr>)}</tbody></table></div></div>}
function Placeholder({view}:{view:View}){const item=navItems.find(i=>i.id===view);const Icon=item?.icon||Activity;return <div className="page"><PageHeading title={item?.label||"PulseWatch"} subtitle="This demo area follows the same secure, serverless PulseWatch experience."/><div className="empty-panel"><Icon size={36}/><h2>{item?.label}</h2><p>This section is available in the full account experience. Guest mode stays safely read-only.</p></div></div>}
function Dashboard(){const [view,setView]=useState<View>("overview");if(view==="landing")return <Landing openDemo={()=>setView("overview")}/>;return <SidebarProvider style={{"--sidebar-width":"230px"} as React.CSSProperties}><AppSidebar view={view} setView={setView}/><SidebarInset><AppHeader/><div className="app-main">{view==="overview"?<Overview setView={setView}/>:view==="monitors"?<Monitors setView={setView}/>:view==="detail"?<Detail setView={setView}/>:view==="incidents"?<Incidents/>:<Placeholder view={view}/>}</div></SidebarInset></SidebarProvider>}
export default function Home(){const [started,setStarted]=useState(false);return started?<Dashboard/>:<Landing openDemo={()=>setStarted(true)}/>}
