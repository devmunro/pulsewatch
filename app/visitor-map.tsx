"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
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

function mapPoint(country: string): [number, number] | null {
  const coordinate = coordinates[country]?.coordinate;
  if (!coordinate) return null;
  const [latitude, longitude] = coordinate.map(Number);
  return [8 + ((longitude + 180) / 360) * 86, 8 + ((90 - latitude) / 180) * 84];
}

export default function VisitorMap() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => api<Summary>("/demo/analytics")
      .then((result) => { if (active) { setSummary(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
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
      <div className="world-map" role="img" aria-label="World map with markers for countries with recorded visitors">
        <svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
          <path className="land" d="M8 23 13 17 20 15 25 19 32 19 35 25 32 30 27 32 25 39 21 42 19 50 16 48 15 41 11 37 9 30ZM26 52 32 53 37 59 39 67 37 75 35 83 32 88 30 78 28 70 25 64ZM43 22 47 19 50 21 49 26 46 28ZM48 30 55 27 61 29 64 26 71 27 77 24 83 28 92 29 94 34 89 37 83 36 80 42 74 43 70 48 65 47 62 53 58 53 57 47 54 44 51 46 49 41 45 39ZM60 51 65 52 68 58 67 65 63 68 60 63ZM77 65 83 66 88 70 91 77 88 83 84 81 82 75 78 72Z" />
          {countries.map(({ country, pageViews }) => {
            const point = mapPoint(country);
            if (!point) return null;
            const radius = 1.1 + 2.1 * Math.sqrt(pageViews / maximum);
            return <g key={country}>
              <circle className="map-pulse" cx={point[0]} cy={point[1]} r={radius + 1.8} />
              <circle className="map-dot" cx={point[0]} cy={point[1]} r={radius}>
                <title>{countryNames.of(country) ?? country}: {pageViews.toLocaleString()} views</title>
              </circle>
            </g>;
          })}
        </svg>
        {!failed && !summary?.pageViews && <div className="map-empty"><Globe2 size={18}/>No page views recorded in the last 30 days</div>}
        {failed && <div className="map-empty map-error"><Globe2 size={18}/>Visitor analytics is temporarily unavailable</div>}
      </div>
      <div className="visitor-breakdown">
        <div className="site-counts"><span>Portfolio <strong>{(sites.portfolio ?? 0).toLocaleString()}</strong></span><span>Highforce <strong>{(sites.highforce ?? 0).toLocaleString()}</strong></span></div>
        {countries.length ? <ul>{countries.slice(0, 5).map(({country, pageViews}) => <li key={country}><span><i/>{countryNames.of(country) ?? country}</span><strong>{pageViews.toLocaleString()}</strong></li>)}</ul> : <p className="visitor-install-hint">{failed ? "Could not load visitor counts from AWS. The monitor dashboard is unaffected; retrying automatically." : "No page views yet. Once the site tracking snippets are installed and visitors arrive, aggregate country counts will appear here. Counts are page views, not unique people; no IP addresses, page URLs, referrers or cookies are stored."}</p>}
        {unplacedCountries.length > 0 && <p className="visitor-install-hint">{unplacedCountries.map((item) => `${countryNames.of(item.country) ?? item.country}: ${item.pageViews.toLocaleString()}`).join(" · ")} — location code has no map coordinate.</p>}
        {countries.length > 5 && <small className="visitor-more">+ {countries.length - 5} more countries</small>}
      </div>
    </div>
  </section>;
}
