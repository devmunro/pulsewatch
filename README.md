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

The existing stack is live in `eu-west-2` at [d1kd92no8bklbu.cloudfront.net](https://d1kd92no8bklbu.cloudfront.net/). The public API currently exposes exactly the two selected sites, Davefolio and Highforce. Account-level budget alerts are configured separately; they notify but do not cap spending. PulseWatch is dashboard-only and has no email alert subscription.

GitHub Actions authenticates with short-lived OIDC credentials. The private `devmunro/pulsewatch` repository has a `production` environment restricted to `main`; its AWS role trust is pinned to this repository's immutable GitHub owner/repository IDs and that environment. `AWS_DEPLOY_ROLE_ARN` is configured as a GitHub Actions secret. Do not use root credentials or long-lived AWS keys for routine deployment.

To deploy, first run **Deploy** from `main` with `deploy` left `false`, review the complete `cdk diff`, then start a separate run with `deploy=true` only after you approve those exact changes. The workflow is pinned to the existing CloudFront origin and eu-west-2. It does not ask for alert email. The existing CDK bootstrap CloudFormation execution role currently has `AdministratorAccess`; the GitHub role can assume only the account's CDK deploy, asset-publishing, and lookup roles, but CloudFormation therefore retains broad account permissions. Review that trade-off before a production deploy.

The public demo is read-only and displays only monitors explicitly selected on the `pulsewatch-demo` public status page. Visitors cannot manage monitors or trigger checks. Never commit local AWS credentials.

## Design reference

The supplied PulseWatch screenshots are the visual source of truth. We preserve their warm paper palette, evergreen navigation, topographic mountain hero, metric cards, chart, monitor tables/cards, and product stack section as real React/CSS—not a flattened screenshot.
