# Visitor map setup

The demo dashboard can show aggregate page views by country for the two explicitly configured sites. PulseWatch derives the country from CloudFront's country header and stores only a site ID, country code, daily aggregate count, and expiry. It does not store visitor IP addresses, URLs, referrers, identifiers, or cookies. Aggregates expire after 90 days; the dashboard shows the most recent 30 days.

The map stays empty until the snippet is installed in each site's source. Add this in the document `<head>` (or the site's global layout):

```html
<script defer src="https://d1kd92no8bklbu.cloudfront.net/pulsewatch-analytics.js" data-pulsewatch-site="portfolio"></script>
```

Use `data-pulsewatch-site="highforce"` on `https://highforce.agency`. The portfolio uses the `portfolio` ID. The snippet counts page loads and same-tab history navigation; it does not intercept forms or collect page paths. Add a clear analytics disclosure to each site's privacy notice before enabling it, and confirm any consent requirements applicable to your visitors and jurisdiction.

The collector accepts requests only from the two configured site origins. For Highforce, both `https://highforce.agency` and `https://www.highforce.agency` are allowed. CDK includes those origins in the API's CORS allow-list automatically. Each request increments page-view counts for the detected country; a person is not deduplicated into a unique visitor. AWS budgets are notifications, not hard spending caps.

This is a public portfolio showcase, not an open sign-up service. Anyone can read the selected status and aggregate counts without logging in. Public account registration is disabled; only an administratively provisioned owner account can change monitors or publish sites.
