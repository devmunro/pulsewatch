"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Box, CircleGauge, Cloud, Code2, ExternalLink, GitBranch, Globe2, LayoutDashboard, LockKeyhole, Radio, Search, Server, ShieldCheck, Siren, Webhook } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";
import Overview from "./overview";
import { api, beginSignIn, CheckRecord, completeSignIn, currentTokens, Incident, Monitor, signOut } from "@/lib/pulsewatch-client";

type View = "landing" | "overview" | "monitors" | "detail" | "incidents" | "status";
type ChartPoint = {time:string;value:number};
const landingFeatures: Array<[typeof Activity, string, string]> = [[Radio,"Real-time","monitoring"],[ShieldCheck,"Reliable","alerts"],[Box,"Built on","AWS serverless"],[LockKeyhole,"Open source","& customizable"]];
const techItems: Array<[typeof Activity, string, string]> = [[Code2,"AWS Lambda","Serverless functions"],[Webhook,"API Gateway","Secure REST API"],[Server,"DynamoDB","Monitoring data"],[ShieldCheck,"Cognito","Owner authentication"],[Activity,"EventBridge","Scheduled checks"],[Siren,"SNS","Incident event routing"],[Cloud,"CloudWatch","Logging & metrics"],[GitBranch,"GitHub Actions","CI/CD deployment"]];

function PulseLogo({ inverse = false }: { inverse?: boolean }) { return <div className="brand"><Activity size={28} strokeWidth={1.5}/><strong className={inverse ? "inverse" : ""}>PulseWatch</strong></div> }
function PrimaryButton({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) { return <button onClick={onClick} className={`primary-btn ${className}`}>{children}</button> }

function Landing({ openDemo, signIn }: { openDemo: () => void; signIn: () => void }) {
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
    <header className="landing-nav"><PulseLogo/><nav aria-label="Main navigation"><a href="#features">Features</a><button onClick={openDemo}>Demo</button><a href="#stack">Tech Stack</a><a href="#project-notes">Project</a></nav><div className="nav-actions"><button className="outline-btn" onClick={signIn}>Owner sign in</button><PrimaryButton onClick={openDemo}>Try demo <ArrowRight size={17}/></PrimaryButton></div></header>
    <section className="hero"><div className="hero-copy"><h1>Uptime<br/>that works<br/>for <em>builders.</em></h1><p>My websites and APIs, monitored in real time—with the live status and performance history on display.</p><div className="hero-actions"><PrimaryButton onClick={openDemo}>Explore live demo <ArrowRight size={17}/></PrimaryButton><a className="outline-btn" href="#stack"><Globe2 size={19}/> View AWS stack</a></div></div><Image ref={heroArtRef} fill priority sizes="(max-width: 900px) 100vw, 72vw" unoptimized className="hero-art" src="/pulsewatch-mountains.png" alt="Engraved alpine mountain landscape with evergreen trees"/></section>
    <section id="features" className="feature-strip">{landingFeatures.map(([Icon,a,b])=><div className="feature" key={a}><Icon size={25}/><span>{a}<br/>{b}</span></div>)}</section>
    <section id="stack" className="tech-section"><div><h2>Built with real-world<br/><em>technologies.</em></h2><p>A personal AWS showcase: serverless monitoring for my live sites, with a public read-only dashboard.</p></div><div className="tech-grid">{techItems.map(([Icon,a,b])=><article key={a}><Icon/><div><strong>{a}</strong><span>{b}</span></div></article>)}</div><div id="project-notes" className="demo-cta"><h2>Personal project <i>•</i></h2><p>View my live monitors and recent performance.<br/>Public access is read-only; monitor management is owner-only.</p><div><PrimaryButton onClick={openDemo}>View dashboard <ArrowRight size={17}/></PrimaryButton><button className="outline-btn" onClick={signIn}>Owner sign in</button></div></div></section>
  </main>
}

const navItems: {id: View; label: string; icon: typeof Activity}[] = [
  {id:"overview",label:"Overview",icon:LayoutDashboard},{id:"monitors",label:"Monitors",icon:CircleGauge},{id:"incidents",label:"Incidents",icon:Siren},{id:"status",label:"Status Page",icon:Globe2},
];
function AppSidebar({ view, setView, isDemo, onSignOut }: { view: View; setView: (v: View)=>void; isDemo:boolean; onSignOut:()=>void }) { return <Sidebar collapsible="offcanvas" className="app-sidebar"><SidebarHeader className="sidebar-head"><button onClick={()=>setView("landing")} aria-label="Return home"><PulseLogo inverse/></button></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{navItems.filter(item=>!isDemo||item.id!=="status").map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton className="side-link" isActive={view===item.id || (view==="detail"&&item.id==="monitors")} onClick={()=>setView(item.id)}><item.icon/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter><div className="demo-user"><span>{isDemo?"G":"U"}</span><div><strong>{isDemo?"Public showcase":"Owner account"}</strong><small>{isDemo?"Read-only · no login required":"Private management"}</small></div>{!isDemo&&<button className="signout" onClick={onSignOut}>Sign out</button>}</div></SidebarFooter></Sidebar> }
function AppHeader({onSearch}:{onSearch:(value:string)=>void}){return <header className="app-header"><SidebarTrigger/><div className="search"><Search size={17}/><input aria-label="Search monitors and incidents" placeholder="Search monitors, incidents..." onChange={event=>onSearch(event.target.value)}/></div><span className="avatar" aria-label="Public read-only dashboard">G</span></header>}
function StatusBadge({status="UP"}:{status?:string}){const label=status==="DOWN"?"Down":status==="UNKNOWN"?"Unknown":"Operational";return <span className={`status ${status==="DOWN"?"status-down":""}`}><i/>{label}</span>}
function Chart({ detail=false, values=[] }:{detail?:boolean;values?:ChartPoint[]}){if(!values.length)return <div className="chart-empty">Real response-time history will appear after the first monitor checks.</div>;return <ResponsiveContainer width="100%" height="100%"><AreaChart data={values} margin={{top:8,right:4,left:-22,bottom:0}}><defs><linearGradient id={detail?"fill-week":"fill-day"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#13814b" stopOpacity={.28}/><stop offset="100%" stopColor="#13814b" stopOpacity={.04}/></linearGradient></defs><CartesianGrid stroke="#e7e4dc" vertical={!detail}/><XAxis dataKey="time" tick={{fontSize:11,fill:"#5f625f"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/><YAxis tick={{fontSize:11,fill:"#5f625f"}} tickLine={false} axisLine={false} unit=" ms"/><Tooltip contentStyle={{borderRadius:8,border:"1px solid #ddd8cf",fontSize:12}}/><Area type="monotone" dataKey="value" stroke="#0f7a44" strokeWidth={2} fill={`url(#${detail?"fill-week":"fill-day"})`}/></AreaChart></ResponsiveContainer>}
function PageHeading({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

function monitorLabel(m: Monitor) {
  const current = m as Monitor & {lastCheckedAt?: string;lastResponseTimeMs?:number;lastStatusCode?:number};
  const checked = m.lastChecked || current.lastCheckedAt;
  const relative = checked ? `${Math.max(0, Math.floor((Date.now() - new Date(checked).getTime()) / 60000))} min ago` : "Not checked yet";
  const latency=m.responseTimeMs??current.lastResponseTimeMs;
  return { ...m, responseTimeMs:latency, statusCode:m.statusCode??current.lastStatusCode, uptime: m.uptime7d==null?"Collecting":`${Number(m.uptime7d).toFixed(2)}%`, response: latency==null?"—":`${latency} ms`, checked: m.lastChecked && !m.lastChecked.includes("T") ? m.lastChecked : relative };
}

function Monitors({setView,onSelect,monitors,isDemo,signIn,query}:{setView:(v:View)=>void;onSelect:(id:string)=>void;monitors:Monitor[];isDemo:boolean;signIn:()=>void;query:string}){const filtered=monitors.filter(m=>`${m.name} ${m.url}`.toLowerCase().includes(query.toLowerCase()));return <div className="page"><PageHeading title="Monitors" subtitle={isDemo?"My live websites · public, read-only view":"Websites and APIs in your account."}>{!isDemo&&<PrimaryButton onClick={signIn}>Add a monitor <ArrowRight size={16}/></PrimaryButton>}</PageHeading>{monitors.length===0?<div className="empty-panel"><Globe2 size={36}/><h2>No monitors published</h2><p>The owner has not published any sites to the public dashboard yet.</p></div>:filtered.length===0?<div className="empty-panel"><h2>No matching monitors</h2><p>Try another name or domain.</p></div>:<div className="monitor-grid">{filtered.map(m=>{const d=monitorLabel(m);return <article className="monitor-card" key={m.monitorId}><div className="monitor-title"><button className="monitor-open" onClick={()=>{onSelect(m.monitorId);setView("detail")}}>{m.name}</button></div>{m.url&&<a href={m.url} target="_blank" rel="noreferrer" aria-label={`Open ${m.name} in a new tab`}>{m.url} <ExternalLink size={12}/></a>}<div className="monitor-metrics"><span><strong>{d.uptime}</strong><small>Uptime (7d)</small></span><span><strong>{d.response}</strong><small>Response time</small></span><span><strong>{d.checked}</strong><small>Last checked</small></span></div><StatusBadge status={m.status}/></article>})}</div>}</div>}
function Detail({setView,monitor,isDemo,onCheck,onToggle,onDelete,onEdit,checking,incidents,query}:{setView:(v:View)=>void;monitor:Monitor;isDemo:boolean;onCheck:()=>void;onToggle:()=>void;onDelete:()=>void;onEdit:(event:React.FormEvent<HTMLFormElement>)=>void;checking:boolean;incidents:Incident[];query:string}){
 const [tab,setTab]=useState("overview");
 const [history,setHistory]=useState<{monitorId:string;rows:ChartPoint[];state:"loading"|"ready"|"empty"|"error"}>({monitorId:"",rows:[],state:"loading"});
 const d=monitorLabel(monitor);
 useEffect(()=>{let active=true;api<{checks:CheckRecord[]}>(isDemo?`/demo/monitors/${monitor.monitorId}/checks`:`/monitors/${monitor.monitorId}/checks`,{},!isDemo).then(({checks})=>{if(!active)return;const rows=checks.slice().reverse().map(check=>({time:new Date(check.timestamp).toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),value:check.responseTimeMs}));setHistory({monitorId:monitor.monitorId,rows,state:rows.length?"ready":"empty"})}).catch(()=>{if(active)setHistory({monitorId:monitor.monitorId,rows:[],state:"empty"})});return()=>{active=false}},[monitor.monitorId,isDemo]);
 const historyState=history.monitorId===monitor.monitorId?history.state:"loading";
 const historyData=history.monitorId===monitor.monitorId?history.rows:[];
 const tabs=["Overview","Response time","Incidents",...(!isDemo?["Settings"]:[])];
 const chartContent=historyState==="loading"?<div className="chart-empty" role="status">Loading real check history…</div>:historyState==="error"?<div className="chart-empty" role="alert">Could not load check history. Try opening this monitor again.</div>:historyState==="empty"?<div className="chart-empty">No response-time history recorded yet.</div>:<Chart detail values={historyData}/>;
 return <div className="page detail-page"><button className="back" onClick={()=>setView("monitors")}><ArrowLeft size={15}/> Back to monitors</button><PageHeading title={monitor.name} subtitle={monitor.url}><div className="heading-actions"><StatusBadge status={monitor.status}/>{!isDemo&&<button className="outline-btn" onClick={onCheck} disabled={checking}>{checking?"Checking…":"Run check"}</button>}</div></PageHeading><Tabs value={tab} onValueChange={setTab}><TabsList variant="line" className="detail-tabs">{tabs.map(x=><TabsTrigger value={x.toLowerCase()} key={x}>{x}</TabsTrigger>)}</TabsList></Tabs>{tab==="settings"&&!isDemo?<section className="panel monitor-settings"><h2>Monitor settings</h2><p>{monitor.intervalMinutes||5}-minute checks · {monitor.enabled===false?"Paused":"Active"}</p><form onSubmit={onEdit}><label>Name<input name="name" required maxLength={80} defaultValue={monitor.name}/></label><label>Website URL<input name="url" required type="url" defaultValue={monitor.url}/></label><label>Check interval<select name="intervalMinutes" defaultValue={String(monitor.intervalMinutes||5)}><option value="5">Every 5 minutes</option><option value="10">Every 10 minutes</option><option value="15">Every 15 minutes</option><option value="60">Every hour</option></select></label><PrimaryButton>Save changes</PrimaryButton></form><div><button className="outline-btn" onClick={onToggle}>{monitor.enabled===false?"Resume monitoring":"Pause monitoring"}</button><button className="danger-btn" onClick={onDelete}>Delete monitor</button></div></section>:tab==="incidents"?<Incidents incidents={incidents.filter(item=>item.monitorId===monitor.monitorId)} monitors={[monitor]} query={query}/>:<><section className="panel chart-panel"><div className="panel-title"><strong>{tab==="overview"?`Response time · ${monitor.name}`:`Response-time history · ${monitor.name}`}</strong><span>{historyState==="ready"?`${historyData.length} available checks`:"Real check history"}</span></div><div className="chart-wrap detail-chart">{chartContent}</div></section><div className="detail-stats">{[[d.uptime,"Uptime (7 days)"],[d.response,"Latest response time"],[d.checked,"Last checked"],[String(monitor.statusCode||"—"),"Last status code"]].map(([a,b])=><article key={b}><strong>{a}</strong><span>{b}</span></article>)}</div>{tab==="response time"&&<p className="empty-copy">The chart shows recorded checks only. No response-time samples are fabricated.</p>}</>}</div>
}
function Incidents({incidents,monitors,query}:{incidents:Incident[];monitors:Monitor[];query:string}){const [filter,setFilter]=useState("all");const filtered=incidents.filter(item=>(filter==="all"||item.monitorId===filter)&&`${item.monitorName||""} ${item.reason||""}`.toLowerCase().includes(query.toLowerCase()));const rows=filtered.map(r=>({key:r.incidentId||r.startedAt,time:new Date(r.startedAt).toLocaleString(),monitor:r.monitorName||r.monitorId||"Monitor unavailable",reason:r.reason||"Monitor unavailable",duration:r.durationMinutes?`${r.durationMinutes} minutes`:r.durationSeconds?`${Math.round(r.durationSeconds/60)} minutes`:"Ongoing",status:r.status}));return <div className="page"><PageHeading title="Incidents" subtitle="A history of downtime and performance issues."><Select value={filter} onValueChange={setFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All monitors</SelectItem>{monitors.map(m=><SelectItem value={m.monitorId} key={m.monitorId}>{m.name}</SelectItem>)}</SelectContent></Select></PageHeading>{rows.length===0?<div className="empty-panel"><h2>{query||filter!=="all"?"No matching incidents":"No published incidents"}</h2><p>{query||filter!=="all"?"Try a different search or monitor filter.":"New incidents from selected monitors will appear here."}</p></div>:<div className="table-wrap incidents-table"><table><thead><tr><th>Time</th><th>Monitor</th><th>Issue</th><th>Duration</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.key}><td>{r.time}</td><td>{r.monitor}</td><td>{r.reason}{r.reason.toLowerCase().includes("down")?<ExternalLink size={11}/>:null}</td><td>{r.duration}</td><td><span className="resolved">{r.status==="RESOLVED"?"Resolved":"Ongoing"}</span></td></tr>)}</tbody></table></div>}</div>}
type PublicStatusData = { name:string; monitors:Monitor[] };
function StatusPageManager({monitors,isDemo}:{monitors:Monitor[];isDemo:boolean}){
 const router={push:(path:string)=>window.location.assign(path)};
 const [page,setPage]=useState<{name:string;slug:string;monitorIds:string[]}|null>(null);
 const [message,setMessage]=useState("");
 const [loading,setLoading]=useState(!isDemo);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{if(!isDemo)api<{statusPage:{name:string;slug:string;monitorIds:string[]}|null}>("/status-page",{},true).then(result=>setPage(result.statusPage)).catch(e=>setMessage(e.message)).finally(()=>setLoading(false))},[isDemo]);
 async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);const monitorIds=monitors.filter(m=>form.getAll("monitorIds").includes(m.monitorId)).map(m=>m.monitorId);setSaving(true);setMessage("");try{const result=await api<{statusPage:{name:string;slug:string;monitorIds:string[]}}>("/status-page",{method:"PUT",body:JSON.stringify({name:form.get("name"),slug:form.get("slug"),monitorIds})},true);setPage(result.statusPage);setMessage(result.statusPage.slug==="pulsewatch-demo"?"Your selected real monitors are now shown in the public read-only demo.":"Your public status page is live.")}catch(e){setMessage(e instanceof Error?e.message:"Could not save the status page")}finally{setSaving(false)}}
 if(!isDemo&&loading)return <div className="page"><div className="empty-panel" role="status"><h2>Loading status-page settings…</h2></div></div>;
 if(!isDemo&&saving)return <div className="page"><div className="empty-panel" role="status"><h2>Saving public status page…</h2></div></div>;
 return <div className="page"><PageHeading title="Status Page" subtitle="Choose exactly which live monitor details visitors can see. Publishing makes their names, site domains, status, and incidents public; visitors cannot edit or trigger checks."/>{isDemo?<div className="empty-panel"><Globe2 size={36}/><h2>Manage published monitors</h2><p>Sign in to add monitors, then select the ones to share in the read-only demo.</p><PrimaryButton onClick={()=>beginSignIn().catch(e=>setMessage(e.message))}>Owner sign in</PrimaryButton></div>:<form key={page?.slug||"new"} className="monitor-form status-form" onSubmit={save}><h2>{page?"Update public demo":"Publish monitors to the demo"}</h2><label>Page name<input name="name" required maxLength={80} defaultValue={page?.name||"PulseWatch live demo"} placeholder="PulseWatch live demo"/></label><label>Public URL slug<input name="slug" required pattern="[a-z0-9]+([a-z0-9-]*[a-z0-9])?" maxLength={48} defaultValue={page?.slug||"pulsewatch-demo"} placeholder="pulsewatch-demo"/></label><fieldset><legend>Choose what to show publicly (up to five)</legend>{monitors.map(m=><label className="check-option" key={m.monitorId}><input type="checkbox" name="monitorIds" value={m.monitorId} defaultChecked={page?.monitorIds.includes(m.monitorId)}/>{m.name}</label>)}</fieldset><p>Use the slug <code>pulsewatch-demo</code> to power the public dashboard. Site paths and query strings are hidden; only each site&apos;s domain is shown. Do not publish services you want kept private.</p>{message&&<p role="status">{message}</p>}<PrimaryButton>Save public selection</PrimaryButton>{page&&<button type="button" className="outline-btn" onClick={()=>router.push(`/status/${page.slug}/`)}>View public page <ArrowRight size={15}/></button>}</form>}</div>
}
function PublicStatusPage({slug}:{slug:string}){const [data,setData]=useState<PublicStatusData|null>(null);const [error,setError]=useState("");useEffect(()=>{api<PublicStatusData>(`/status/${encodeURIComponent(slug)}`).then(setData).catch(e=>setError(e.message))},[slug]);const operational=data?.monitors.every(m=>m.status!=="DOWN");return <main className="public-status"><PulseLogo/><span className="demo-pill">● PUBLIC STATUS</span>{error?<p>{error}</p>:data?<><h1>{data.name}</h1><p className={operational?"all-good":"status-down-text"}>● {operational?"All systems operational":"Some systems are experiencing issues"}</p><div className="monitor-grid">{data.monitors.map(m=><article className="monitor-card" key={m.monitorId}><strong>{m.name}</strong><StatusBadge status={m.status}/><p>{m.status==="DOWN"?"Service disruption":m.status==="UP"?"Operational":"Awaiting first check"}</p></article>)}</div></>:<p>Loading current service status…</p>}</main>}
function Dashboard({onSignIn}:{onSignIn:()=>void}) {
  const [view,setView]=useState<View>("overview");
  const [monitors,setMonitors]=useState<Monitor[]>([]);
  const [incidents,setIncidents]=useState<Incident[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [checking,setChecking]=useState(false);
  const [isDemo,setDemo]=useState(true);
  const [error,setError]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [reloadKey,setReloadKey]=useState(0);
  const [loadedRequest,setLoadedRequest]=useState<number|null>(null);
  const loading=loadedRequest!==reloadKey;
  const selected=monitors.find(m=>m.monitorId===selectedId)||monitors[0];

  useEffect(()=>{
    const syncViewToPath=()=>setView(location.pathname.startsWith("/dashboard")?"overview":"landing");
    window.addEventListener("popstate",syncViewToPath);
    return()=>window.removeEventListener("popstate",syncViewToPath);
  },[]);
  useEffect(()=>{
    if(view==="landing"&&location.pathname.startsWith("/dashboard"))history.replaceState(history.state,"","/");
    else if(view!=="landing"&&location.pathname!=="/dashboard/")history.replaceState(history.state,"","/dashboard/");
  },[view]);

  useEffect(()=>{
    let live=true;
    const token=currentTokens();
    Promise.resolve().then(()=>{if(live){setDemo(!token);setError("")}});
    (async()=>{
      try {
        const [m,i]=token
          ? await Promise.all([api<{monitors:Monitor[]}>("/monitors",{},true),api<{incidents:Incident[]}>("/incidents",{},true)])
          : await Promise.all([api<{monitors:Monitor[]}>("/demo/monitors"),api<{incidents:Incident[]}>("/demo/incidents")]);
        if(live){setMonitors(m.monitors);setSelectedId(m.monitors[0]?.monitorId||"");setIncidents(i.incidents)}
      } catch(e) { if(live)setError(e instanceof Error?e.message:"Could not load PulseWatch data") }
      finally { if(live)setLoadedRequest(reloadKey); }
    })();
    return()=>{live=false};
  },[reloadKey]);

  async function createMonitor(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError("");
    try {const result=await api<{monitor:Monitor}>("/monitors",{method:"POST",body:JSON.stringify({name:form.get("name"),url:form.get("url"),intervalMinutes:Number(form.get("intervalMinutes"))})},true);setMonitors(old=>[...old,result.monitor]);setShowForm(false)}
    catch(e){setError(e instanceof Error?e.message:"Could not create monitor")}finally{setBusy(false)}
  }
  async function runCheck(){
    if(!selected)return;setChecking(true);setError("");
    try {const result=await api<{status:string;statusCode:number;responseTimeMs:number;timestamp:string}>(`/monitors/${selected.monitorId}/check`,{method:"POST"},true);setMonitors(items=>items.map(m=>m.monitorId===selected.monitorId?{...m,status:result.status,statusCode:result.statusCode,responseTimeMs:result.responseTimeMs,lastChecked:result.timestamp}:m))}
    catch(e){setError(e instanceof Error?e.message:"Check failed")}finally{setChecking(false)}
  }
  async function toggleMonitor(){
    if(!selected)return;
    try {const result=await api<{monitor:Monitor}>(`/monitors/${selected.monitorId}`,{method:"PATCH",body:JSON.stringify({enabled:selected.enabled===false})},true);setMonitors(items=>items.map(m=>m.monitorId===selected.monitorId?result.monitor:m))}
    catch(e){setError(e instanceof Error?e.message:"Could not update monitor")}
  }
  async function editMonitor(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected)return;const form=new FormData(event.currentTarget);
    try {const result=await api<{monitor:Monitor}>(`/monitors/${selected.monitorId}`,{method:"PATCH",body:JSON.stringify({name:form.get("name"),url:form.get("url"),intervalMinutes:Number(form.get("intervalMinutes"))})},true);setMonitors(items=>items.map(m=>m.monitorId===selected.monitorId?result.monitor:m));setError("")}
    catch(e){setError(e instanceof Error?e.message:"Could not update monitor")}
  }
  async function deleteMonitor(){
    if(!selected||!window.confirm(`Delete ${selected.name}? This also removes its schedule.`))return;
    try {await api(`/monitors/${selected.monitorId}`,{method:"DELETE"},true);setMonitors(items=>items.filter(m=>m.monitorId!==selected.monitorId));setView("monitors")}
    catch(e){setError(e instanceof Error?e.message:"Could not delete monitor")}
  }

  if(view==="landing")return <Landing openDemo={()=>setView("overview")} signIn={onSignIn}/>;
  return <SidebarProvider style={{"--sidebar-width":"230px"} as React.CSSProperties}>
    <AppSidebar view={view} setView={setView} isDemo={isDemo} onSignOut={()=>signOut().catch(e=>setError(e.message))}/>
    <SidebarInset><AppHeader onSearch={setSearchQuery}/><div className="app-main">
      {error&&<div className="error-banner" role="alert">{error}<span className="error-actions"><button onClick={()=>setReloadKey(value=>value+1)}>Retry</button><button aria-label="Dismiss error" onClick={()=>setError("")}>×</button></span></div>}
      {loading?<div className="page"><div className="empty-panel" role="status"><h2>Loading live PulseWatch data…</h2><p>Connecting to the monitoring API.</p></div></div>:view==="overview"?<Overview setView={setView} onSelect={setSelectedId} monitors={monitors} incidents={incidents} isDemo={isDemo} signIn={isDemo?onSignIn:()=>{setView("monitors");setShowForm(true)}}/>:
       view==="monitors"?<><Monitors setView={setView} onSelect={setSelectedId} monitors={monitors} isDemo={isDemo} signIn={()=>setShowForm(true)} query={searchQuery}/>{showForm&&<div className="modal-backdrop"><form className="monitor-form" onSubmit={createMonitor}><button type="button" className="modal-close" onClick={()=>setShowForm(false)}>×</button><h2>Add a monitor</h2><label>Name<input name="name" required maxLength={80} placeholder="My website"/></label><label>Website URL<input name="url" required type="url" placeholder="https://example.com"/></label><label>Check interval<select name="intervalMinutes" defaultValue="5"><option value="5">Every 5 minutes</option><option value="10">Every 10 minutes</option><option value="15">Every 15 minutes</option><option value="60">Every hour</option></select></label><p>Up to five monitors per account. Only public HTTP and HTTPS endpoints are accepted.</p><PrimaryButton>{busy?"Creating…":"Create monitor"}</PrimaryButton></form></div>}</>:
       view==="detail"&&selected?<Detail setView={setView} monitor={selected} isDemo={isDemo} incidents={incidents} query={searchQuery} onCheck={runCheck} onToggle={toggleMonitor} onDelete={deleteMonitor} onEdit={editMonitor} checking={checking}/>:
       view==="detail"?<div className="page"><div className="empty-panel"><h2>No monitor selected</h2><p>Choose a published monitor to view its details.</p></div></div>:
       view==="incidents"?<Incidents incidents={incidents} monitors={monitors} query={searchQuery}/>:
       view==="status"?<StatusPageManager monitors={monitors} isDemo={isDemo}/>:null}
    </div></SidebarInset>
  </SidebarProvider>;
}
export default function Home(){const [started,setStarted]=useState(false);const [authError,setAuthError]=useState("");const [publicSlug,setPublicSlug]=useState("");useEffect(()=>{if(location.pathname.startsWith("/auth/callback")){completeSignIn().then(()=>setStarted(true)).catch(e=>{setAuthError(e.message);history.replaceState({},"", "/")})}else{const syncRoute=()=>{const match=location.pathname.match(/^\/status\/([^/]+)/);setPublicSlug(match?decodeURIComponent(match[1]):"");setStarted(location.pathname.startsWith("/dashboard")||!!currentTokens()||!!match)};const timer=window.setTimeout(syncRoute,0);window.addEventListener("popstate",syncRoute);return()=>{window.clearTimeout(timer);window.removeEventListener("popstate",syncRoute)}}},[]);const login=()=>beginSignIn().catch(e=>setAuthError(e.message));const openDashboard=()=>{if(!location.pathname.startsWith("/dashboard"))history.pushState(history.state,"","/dashboard/");setPublicSlug("");setStarted(true)};return <>{authError&&<div className="error-banner auth-error" role="alert">{authError}<button onClick={()=>setAuthError("")}>×</button></div>}{publicSlug?<PublicStatusPage slug={publicSlug}/>:started?<Dashboard onSignIn={login}/>:<Landing openDemo={openDashboard} signIn={login}/>}</>}
