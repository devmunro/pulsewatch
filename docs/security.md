# Security notes

- Cognito uses email verification, a 12-character password minimum, and an authorization-code browser flow with PKCE. No client secret is shipped to the browser. Tokens are stored in session storage (cleared when the browser tab/session ends).
- API Gateway verifies JWTs before account routes reach Lambda. The API derives the owner from verified JWT claims and uses owner-scoped DynamoDB keys; request bodies cannot choose an owner.
- Monitor URL validation blocks non-HTTP(S) schemes, URL credentials, fragments, nonstandard ports, localhost, private/reserved/link-local DNS results, and mixed public/private DNS answers. Outbound requests pin the vetted DNS answer and revalidate redirects.
- Guest demo APIs expose only monitor IDs the account owner explicitly selects on the `pulsewatch-demo` public status page. Public responses are projected to monitor name, domain (not URL path/query), status, latest response metadata, and incidents belonging to selected monitors; owner IDs, schedule settings, and internal DynamoDB keys are omitted. Guest routes cannot create, edit, or delete monitors or invoke check Lambdas.
- Publishing to the public demo is an intentional disclosure: visitors can see the selected site domains, names, operational status, and incident details. Do not select private services or use credentials/tokens in URLs.
- DynamoDB uses AWS-managed encryption, on-demand capacity, point-in-time recovery, and 90-day TTL only for check history. Lambda logs have seven-day retention. S3 is private and CloudFront uses OAC.
- The API Lambda can create/update/delete schedules only in its dedicated schedule group and pass only the dedicated scheduler invocation role. Checker invocation and SNS publishing are scoped to project resources.

Before public production use, complete dependency scanning, penetration testing, alert delivery tests, account recovery tests, and a security review of IAM/CloudFront/API settings. CloudFormation and Lambda logs may contain operational metadata; avoid logging authorization headers or secrets.
