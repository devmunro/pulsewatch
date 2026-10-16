"use client";

import { Activity, ExternalLink, Globe2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Incident, Monitor } from "@/lib/pulsewatch-client";
import { useEffect, useState } from "react";
import { api, CheckRecord, currentTokens } from "@/lib/pulsewatch-client";
import VisitorMap from "./visitor-map";

type ChartPoint = { time: string; value: number };

function StatusBadge({ status = "UNKNOWN" }: { status?: string }) {
  const label = status === "DOWN" ? "Down" : status === "UP" ? "Operational" : "Awaiting check";
  return <span className={`status ${status === "DOWN" ? "status-down" : ""}`}><i />{label}</span>;
}

function checkedLabel(value?: string) {
  if (!value) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes < 1 ? "Just now" : `${minutes} min ago`;
}

export default function Overview({
  setView,
  onSelect,
  monitors,
  incidents,
  isDemo,
  signIn,
}: {
  setView: (view: "detail") => void;
  onSelect: (id: string) => void;
  monitors: Monitor[];
  incidents: Incident[];
  isDemo: boolean;
  signIn: () => void;
}) {
  const [chart, setChart] = useState<{ monitorId: string; rows: ChartPoint[]; state: "ready" | "empty" | "error" }>({ monitorId: "", rows: [], state: "empty" });
  const firstMonitorId = monitors[0]?.monitorId;
  useEffect(() => {
    let live = true;
    if (!firstMonitorId) return () => { live = false; };
    const path = isDemo ? `/demo/monitors/${firstMonitorId}/checks` : `/monitors/${firstMonitorId}/checks`;
    api<{checks: CheckRecord[]}>(path, {}, !isDemo && Boolean(currentTokens()))
      .then(({checks}) => {
        if (!live) return;
        const values = checks.slice().reverse().map((check) => ({time: new Date(check.timestamp).toLocaleTimeString(undefined, {hour:"2-digit", minute:"2-digit"}), value: check.responseTimeMs}));
        setChart({ monitorId: firstMonitorId, rows: values, state: values.length ? "ready" : "empty" });
      })
      .catch(() => { if (live) setChart({ monitorId: firstMonitorId, rows: [], state: "error" }); });
    return () => { live = false; };
  }, [firstMonitorId, isDemo]);
  const chartValues = chart.monitorId === firstMonitorId ? chart.rows : [];
  const chartState = !firstMonitorId ? "empty" : chart.monitorId === firstMonitorId ? chart.state : "loading";
  const uptime = monitors.map((monitor) => monitor.uptime7d).filter((value): value is number => typeof value === "number");
  const response = monitors.map((monitor) => monitor.responseTimeMs).filter((value): value is number => typeof value === "number");
  const operational = monitors.length > 0 && monitors.every((monitor) => monitor.status === "UP");
  const stats = [
    [String(monitors.length), "Monitors"],
    [uptime.length ? `${(uptime.reduce((sum, value) => sum + value, 0) / uptime.length).toFixed(2)}%` : "Collecting", "Uptime (7 days)"],
    [response.length ? `${Math.round(response.reduce((sum, value) => sum + value, 0) / response.length)} ms` : "—", "Avg. response time"],
    [String(incidents.filter((incident) => incident.status !== "RESOLVED").length), "Active incidents"],
  ];

  return <div className="page">
    {isDemo && <span className="demo-pill">● LIVE DEMO · READ ONLY</span>}
    <div className="page-heading">
      <div><h1>Overview</h1><p>{isDemo ? "Live status and check history for your published websites." : "Your monitoring at a glance."}</p></div>
      <div className="heading-actions"><span className="all-good">● {monitors.length === 0 ? "No monitors published" : operational ? "All systems operational" : "Some systems need attention"}</span><button className="primary-btn" onClick={signIn}>{isDemo ? "Owner sign in" : "Add a monitor"}</button></div>
    </div>
    <div className="stats-grid">{stats.map(([value, label], index) => <article key={label}><strong className={index === 1 ? "green" : ""}>{value}</strong><span>{label}</span>{index > 0 && index < 3 && <Activity size={18} />}</article>)}</div>
    {isDemo && monitors.length === 0 && <div className="empty-panel"><Globe2 size={36}/><h2>No real monitors published yet</h2><p>The public demo is being set up. Refresh shortly, or sign in to manage your own monitors.</p><button className="primary-btn" onClick={signIn}>Sign in</button></div>}
    <section className="panel chart-panel"><div className="panel-title"><strong>Response time{monitors[0] ? ` · ${monitors[0].name}` : ""}</strong><span>{isDemo ? "Real check history" : "Monitor history"}</span></div><div className="chart-wrap">{chartState === "ready" ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartValues} margin={{top:8,right:4,left:-22,bottom:0}}><defs><linearGradient id="overview-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#13814b" stopOpacity={.28}/><stop offset="100%" stopColor="#13814b" stopOpacity={.04}/></linearGradient></defs><CartesianGrid stroke="#e7e4dc"/><XAxis dataKey="time" tick={{fontSize:11,fill:"#5f625f"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/><YAxis tick={{fontSize:11,fill:"#5f625f"}} tickLine={false} axisLine={false} unit=" ms"/><Tooltip/><Area type="monotone" dataKey="value" stroke="#0f7a44" strokeWidth={2} fill="url(#overview-fill)"/></AreaChart></ResponsiveContainer> : <div className="chart-empty" role={chartState === "error" ? "alert" : "status"}>{chartState === "loading" ? "Loading real response-time history…" : chartState === "error" ? "Could not load response-time history. Check the API connection and retry." : "Real response-time history will appear after the first monitor checks."}</div>}</div></section>
    {isDemo && <VisitorMap/>}
    <section><h2 className="section-title">Monitors</h2>{monitors.length === 0 ? <p className="empty-copy">No public monitors are available yet.</p> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Response time</th><th>Uptime (7d)</th><th>Last checked</th><th/></tr></thead><tbody>{monitors.map((monitor) => <tr key={monitor.monitorId} onClick={() => { onSelect(monitor.monitorId); setView("detail"); }}><td><strong>{monitor.name}</strong></td><td><StatusBadge status={monitor.status}/></td><td>{monitor.responseTimeMs == null ? "—" : `${monitor.responseTimeMs} ms`}</td><td>{monitor.uptime7d == null ? "Collecting" : `${monitor.uptime7d.toFixed(2)}%`}</td><td>{checkedLabel(monitor.lastChecked || (monitor as Monitor & {lastCheckedAt?: string}).lastCheckedAt)}</td><td><ExternalLink size={15}/></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
