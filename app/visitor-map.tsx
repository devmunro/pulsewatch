"use client";

import { useEffect, useState } from "react";
import countryCoordinates from "country-iso-to-coordinates";
import { api } from "@/lib/pulsewatch-client";

type Summary = {
  rangeDays: number;
  pageViews: number;
  countries: { country: string; pageViews: number }[];
  sites: { siteId: string; pageViews: number }[];
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const coordinates = countryCoordinates as Record<string, { coordinate: [string, string]; name: string }>;
const mapViewHeight = 150;

function mapPoint(country: string): [number, number] | null {
  if (country === "AQ") return null;
  const coordinate = coordinates[country]?.coordinate;
  if (!coordinate || coordinate.some((value) => !value.trim())) return null;
  const [latitude, longitude] = coordinate.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const point: [number, number] = [longitude + 180, 90 - latitude];
  if (point[0] < 0 || point[0] > 360 || point[1] < 0 || point[1] > mapViewHeight) return null;
  return point;
}

export default function VisitorMap() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => api<Summary>("/demo/analytics")
      .then((result) => { if (active) { setSummary(result); setFailed(false); setLoading(false); } })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const countries = summary?.countries ?? [];
  const maximum = Math.max(1, ...countries.map((item) => item.pageViews));
  const sites = Object.fromEntries((summary?.sites ?? []).map((item) => [item.siteId, item.pageViews]));
  const unplacedCountries = countries.filter(({ country }) => !mapPoint(country));

  return <section className="visitor-panel" aria-labelledby="visitor-map-title">
    <div className="visitor-heading">
      <div><h2 id="visitor-map-title">Visitor locations</h2><p>Country-level page views · last {summary?.rangeDays ?? 30} days</p></div>
      <span className="visitor-total"><strong>{summary ? summary.pageViews.toLocaleString() : "—"}</strong><small>page views</small></span>
    </div>
    <div className="visitor-content">
      <div className="world-map" role="group" aria-label="Visitor map" aria-busy={loading}>
        <svg viewBox={`0 0 360 ${mapViewHeight}`} role="img" aria-label="World map with markers for countries with recorded visitors" preserveAspectRatio="xMidYMid meet">
          <image href="/world-map.svg" x="0" y="0" width="360" height="180" preserveAspectRatio="none" />
          {countries.map(({ country, pageViews }) => {
            const point = mapPoint(country);
            if (!point) return null;
            const radius = 0.75 + 0.65 * Math.sqrt(pageViews / maximum);
            return <g key={country} data-country={country}>
              <circle className="map-pulse" cx={point[0]} cy={point[1]} r={radius + 1.1} />
              <circle className="map-dot" cx={point[0]} cy={point[1]} r={radius}>
                <title>{countryNames.of(country) ?? country}: {pageViews.toLocaleString()} views</title>
              </circle>
            </g>;
          })}
        </svg>
        {loading && <div className="map-empty" role="status" aria-live="polite"><span className="map-loading-indicator"/>Loading visitor locations…</div>}
        {failed && <div className="map-empty map-error" role="status" aria-live="polite">Visitor analytics is temporarily unavailable</div>}
      </div>
      <div className="visitor-breakdown">
        <div className="site-counts"><span>Portfolio <strong>{(sites.portfolio ?? 0).toLocaleString()}</strong></span><span>Highforce <strong>{(sites.highforce ?? 0).toLocaleString()}</strong></span></div>
        {countries.length ? <ul>{countries.slice(0, 5).map(({country, pageViews}) => <li key={country}><span><i/>{countryNames.of(country) ?? country}</span><strong>{pageViews.toLocaleString()}</strong></li>)}</ul> : <p className="visitor-install-hint">{failed ? "Could not load visitor counts from AWS. The monitor dashboard is unaffected; retrying automatically." : "No page views yet. Once the site tracking snippets are installed and visitors arrive, aggregate country counts will appear here. Counts are page views, not unique people; no IP addresses, page URLs, referrers or cookies are stored."}</p>}
        {unplacedCountries.length > 0 && <p className="visitor-install-hint">{unplacedCountries.map((item) => `${countryNames.of(item.country) ?? item.country}: ${item.pageViews.toLocaleString()}`).join(" · ")} — outside the map&apos;s displayed area.</p>}
        {countries.length > 5 && <small className="visitor-more">+ {countries.length - 5} more countries</small>}
      </div>
    </div>
  </section>;
}
