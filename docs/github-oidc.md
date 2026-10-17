# GitHub OIDC deployment

The public `devmunro/pulsewatch` repository deploys through GitHub Actions OIDC; no AWS access key is stored in GitHub. The deployment region is `eu-west-2` and the existing site origin is `https://d1kd92no8bklbu.cloudfront.net`.

## AWS trust

- OIDC provider: `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- Role: `arn:aws:iam::975739936480:role/PulseWatchGitHubDeploy`.
- Trust subject: `repo:devmunro@57059357/pulsewatch@1422629038:environment:production`.
- The role's inline policy allows `sts:AssumeRole` and `sts:TagSession` only for the account's `cdk-hnb659fds-deploy-role`, `cdk-hnb659fds-file-publishing-role`, and `cdk-hnb659fds-lookup-role` in `eu-west-2`.

The immutable GitHub owner/repository IDs are part of the subject because this repository was created after GitHub's immutable OIDC subject format became available. The `production` environment is configured to allow only the `main` branch, and the workflow has an additional `main`-branch job condition.

## Review and deploy

`AWS_DEPLOY_ROLE_ARN` is configured as a GitHub Actions secret. On a push to `main`, the checks workflow runs first. When it succeeds, the deploy workflow checks out that exact commit, builds the application, prints the CDK diff, and deploys the production stack. CDK's `--require-approval broadening` remains enabled for security-sensitive changes.

The workflow also supports manual runs from `main`: `deploy=false` prints the diff without deploying, while `deploy=true` requests a deployment after review. The `production` environment and OIDC trust remain restricted to `main`.

## Permission boundary caveat

The account's existing CDK CloudFormation execution role currently has the AWS-managed `AdministratorAccess` policy. The GitHub role itself has no direct service permissions, but the CDK deploy role can pass that CloudFormation execution role. As a result, the effective CloudFormation permission boundary is broad. Keep the GitHub trust restricted; replace the bootstrap execution policy with a tested, narrower policy before using this account for unrelated workloads.
