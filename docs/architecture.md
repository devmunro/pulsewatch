# PulseWatch architecture

PulseWatch is deployed in `eu-west-2` by default. The frontend is a Next.js static export in a private S3 bucket, served through CloudFront with Origin Access Control. CloudFront forwards `/api/*` to API Gateway and sends other requests to S3. The browser therefore uses same-origin API calls after deployment.

API Gateway routes demo reads without authentication and protects account routes with a Cognito JWT authorizer. The Python API Lambda owns monitor and status-page operations. DynamoDB tables use on-demand billing; check history expires after 90 days. EventBridge Scheduler invokes the checker Lambda at the selected interval, and the checker records health, opens/resolves incidents and publishes alert messages to SNS. CloudWatch log groups retain logs for seven days.

The guest dashboard reads only monitors explicitly selected on the owner's public status page with slug `pulsewatch-demo`; if it is not configured, the dashboard is empty rather than showing fabricated data. Public APIs project safe fields and never include update or check actions. Authenticated monitor URLs are restricted to standard HTTP(S) ports, DNS-resolved before use, rejected if any answer is non-public, and pinned to a validated IP for each request. Redirect targets are independently revalidated. The API enforces owner-scoped keys, a five-monitor limit, and a minimum five-minute schedule interval.

## Cost and data safeguards

AWS Budgets are account-level controls and are configured separately from this stack to avoid duplicate budgets. Budget notifications are alerts, not spending caps. Optionally confirm the SNS email subscription for monitor incidents. DynamoDB is on-demand, Lambda is short-lived, and there are no always-on compute instances. Budgets do not guarantee zero charges: CloudFront, data transfer, logs, data recovery features, and account-level resources can incur charges. Review the AWS Pricing Calculator and account billing dashboard before production use.

DynamoDB tables have point-in-time recovery and `RETAIN` removal policies. Check results expire after 90 days; monitor and incident records are retained. Cognito users/table data must be deliberately removed through AWS if the stack is retired. Never put AWS credentials in the repository, workflow variables, or chat.

## Deployment sequence

1. Build static assets with `npm run build:aws` from the repo root.
2. Install infrastructure dependencies and run `npm run build` and `npm run synth` from `infrastructure/`.
3. The existing production stack is in `eu-west-2` and serves `https://d1kd92no8bklbu.cloudfront.net`.
4. GitHub Actions uses the `PulseWatchGitHubDeploy` OIDC role, restricted to this repository's immutable owner/repository IDs and the `production` environment. The production environment only allows `main`; the workflow itself also blocks other refs. The role can assume only the CDK deploy, file-publishing, and lookup roles in this account and region.
5. A successful push to `main` triggers deployment after the checks workflow passes. GitHub Actions prints the CDK diff and deploys with OIDC; broadening changes still require CDK approval. For a manual preview, run the workflow from `main` with `deploy=false`; a separate `deploy=true` run deploys the reviewed change. The workflow does not request an email address or configure email alerts.
6. To publish real data to the public dashboard, sign in, add monitors, then create a public status page with slug `pulsewatch-demo` and select only the monitors you intend to share. The guest dashboard is read-only and does not invoke checks; scheduled checks run independently.

The existing CDK bootstrap CloudFormation execution role has the AWS-managed `AdministratorAccess` policy. This means the restricted GitHub OIDC role's effective deployment path can make broad changes through CloudFormation; a dedicated narrower CloudFormation execution policy is a security-hardening follow-up before using the account for other workloads.

Until step 3, tests and synthesis can be run without AWS credentials. Actual deployment is intentionally not performed by local CI.
