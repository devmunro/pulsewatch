# PulseWatch

PulseWatch is a production-style, cost-conscious website and API uptime monitoring platform. This repository currently contains the first complete product slice: the public landing page and a read-only guest dashboard based on the approved design.

## Current experience

- Responsive public landing page
- Read-only guest demo with seeded monitoring data
- Overview metrics and response-time chart
- Monitor grid and detailed monitor view
- Incident history and operational status states
- Reusable React components with accessible navigation

## Technology

- Next.js, React, TypeScript, and Tailwind CSS
- Recharts for monitoring visualisations
- Lucide icons and accessible UI primitives
- Vinext/Cloudflare-compatible production build for the review environment

The planned production architecture uses AWS Lambda, API Gateway HTTP API, DynamoDB, Cognito, EventBridge, SNS, and CloudWatch, defined with AWS CDK. Those infrastructure and authenticated-monitoring phases will be added incrementally.

## Local development

```bash
npm ci
npm run dev
```

Then open `http://localhost:5173`.

## Quality checks

```bash
npx tsc --noEmit
npm run build
```

## Design

The supplied PulseWatch screenshots are the authoritative visual reference. The interface is implemented as real React components; the screenshots are not embedded in the application.

## Cost and security direction

PulseWatch is designed around pay-per-use AWS services, a five-monitor limit per account, five-minute minimum check intervals, short log retention, DynamoDB TTL for historical checks, Cognito-based identity, least-privilege IAM, and explicit SSRF protection for monitored URLs.
