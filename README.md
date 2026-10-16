# PulseWatch

PulseWatch is a cost-conscious uptime monitoring product built to match the supplied design reference. The repo includes the screenshot-led landing page, a read-only public dashboard backed by the owner's explicitly published monitors, AWS serverless API/backend, and AWS CDK infrastructure for S3 + CloudFront hosting.

## Product slices

- Responsive landing page with the supplied alpine artwork and restrained parallax.
- Read-only demo overview, monitors and incidents served only from the owner's explicitly selected public status page (`pulsewatch-demo`); no fabricated monitor records are shown.
- Optional, cookie-free page-view counts by country for the portfolio and agency sites. The map remains empty until the tracking snippets are installed and visitors arrive; it never presents sample traffic as real. Counts are page views, not unique people.
- Cognito authorization-code owner sign-in with PKCE and session-only browser tokens. Public registration is disabled; the dashboard is a read-only personal showcase.
- Authenticated monitor listing and creation, with owner checks, five-monitor cap, URL SSRF defenses and EventBridge schedules.
- Python API/checker Lambdas, DynamoDB history/incidents/status-page records, SNS incident messages, CloudWatch logs, and cost budgets.
- GitHub Actions for Python, frontend, browser, and CDK checks, plus an explicitly manual OIDC deployment workflow.

See [architecture](docs/architecture.md) and [security notes](docs/security.md) for the AWS design, cost safeguards, and deployment sequence.
See [visitor analytics setup](docs/visitor-analytics.md) for the optional site snippets and data handling details.

## Local development

```bash
npm ci
npm run dev
```

Then open `http://localhost:5173`. This remains the review/demo frontend. `npm run build` is the existing Vinext preview build; `npm run build:aws` makes the static Next.js export in `out/` used by CDK.

## Checks

```bash
npm run lint
npx playwright install chromium
npm run test:e2e
npm run build:aws
python -m pip install -r backend/requirements-dev.txt
python -m pytest -q -c backend/pyproject.toml backend/tests
python -m ruff check backend/functions backend/tests
cd infrastructure
npm ci
npm run build
npm run synth
```

## AWS setup and deployment

The CDK stack defaults to `eu-west-2`. Before deploying, enable MFA, configure temporary AWS CLI sign-in, bootstrap CDK, and review the proposed changes. Configure account-level AWS Budget alerts separately; they are notifications, not spending caps, and are not created by this stack. PulseWatch is dashboard-only: no email subscription is configured for incident alerts.

The first deployment creates CloudFront, Cognito, API, and data resources. Use the `WebsiteUrl` output as `siteOrigin` and `allowedOrigins` in a second reviewed deployment so Cognito redirect/logout URLs match. To populate the public demo, sign in, create monitors, then create a public status page with the slug `pulsewatch-demo` and select which monitors to expose. Visitors can view published status but cannot manage monitors or trigger checks. Never commit local AWS credentials.

The repository is private. Configure the OIDC role trust policy and add `AWS_DEPLOY_ROLE_ARN` as a GitHub Actions secret only after reviewing the permissions. The manual deployment workflow asks for the production site origin; it does not request an alert email. Use the production environment's approval gate and inspect the `cdk diff` output before approving a deployment.

## Design reference

The supplied PulseWatch screenshots are the visual source of truth. We preserve their warm paper palette, evergreen navigation, topographic mountain hero, metric cards, chart, monitor tables/cards, and product stack section as real React/CSS—not a flattened screenshot.
