# Visitor map setup

The demo dashboard can show aggregate page views by country for the two explicitly configured sites. PulseWatch derives the country from CloudFront's country header and stores only a site ID, country code, daily aggregate count, and expiry. It does not store visitor IP addresses, URLs, referrers, identifiers, or cookies. Aggregates expire after 90 days; the dashboard shows the most recent 30 days.

The map stays empty until the snippet is installed in each site's source. Add this in the document `<head>` (or the site's global layout):

```html
<script defer src="https://d1kd92no8bklbu.cloudfront.net/pulsewatch-analytics.js" data-pulsewatch-site="portfolio"></script>
```

Use `data-pulsewatch-site="highforce"` on `https://highforce.agency`. The portfolio uses the `portfolio` ID. The snippet counts page loads and same-tab history navigation; it does not intercept forms or collect page paths. Add a clear analytics disclosure to each site's privacy notice before enabling it, and confirm any consent requirements applicable to your visitors and jurisdiction.

The collector accepts requests only from the two configured site origins. For Highforce, both `https://highforce.agency` and `https://www.highforce.agency` are allowed. CDK includes those origins in the API's CORS allow-list automatically. Each request increments page-view counts for the detected country; a person is not deduplicated into a unique visitor. The browser tracker never reads or sends an IP address. AWS must handle a visitor's IP at the network edge to deliver the request, but PulseWatch does not use it for analytics, save it to the analytics table, or publish it.

To exclude your own browser from future counts, open each tracked site and run this in that site's browser developer console, then reload the page:

```js
localStorage.setItem("pulsewatch-analytics-opt-out", "true")
```

The setting is stored only in that browser on that site (so repeat on both site domains and other browsers/devices). The tracker also respects the browser's Do Not Track setting and fails closed if local storage is unavailable. To opt back in on that site, run `window.PulseWatchAnalytics.enable()` in the console. This only affects future requests; aggregate counts already collected cannot be attributed to or removed for one person because no per-visitor records are kept.

AWS budgets are notifications, not hard spending caps.

This is a public portfolio showcase, not an open sign-up service. Anyone can read the selected status and aggregate counts without logging in. Public account registration is disabled; only an administratively provisioned owner account can change monitors or publish sites.
