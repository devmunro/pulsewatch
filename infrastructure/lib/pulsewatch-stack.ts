import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";

export class PulseWatchStack extends Stack {
  constructor(scope: cdk.App, id: string, props?: StackProps) {
    super(scope, id, props);
    const projectRoot = path.resolve(__dirname, "../..");
    const siteOrigin = String(this.node.tryGetContext("siteOrigin") ?? "http://localhost:5173");
    const analyticsSites = {
      portfolio: { origin: "https://davefolio.vercel.app", origins: ["https://davefolio.vercel.app"] },
      highforce: { origin: "https://highforce.agency", origins: ["https://highforce.agency", "https://www.highforce.agency"] },
    };
    const originsList = [...new Set([
      siteOrigin,
      ...String(this.node.tryGetContext("allowedOrigins") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
      ...Object.values(analyticsSites).flatMap((site) => site.origins),
    ])];

    const userPool = new cognito.UserPool(this, "Users", {
      userPoolName: "pulsewatch-users",
      // This is a personal showcase, not a multi-tenant public SaaS sign-up.
      // The owner account is provisioned administratively; visitors only use read-only routes.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: { minLength: 12, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const authDomain = `pw-${this.account}`;
    userPool.addDomain("HostedDomain", { cognitoDomain: { domainPrefix: authDomain } });
    const userPoolClient = userPool.addClient("WebClient", {
      userPoolClientName: "pulsewatch-web",
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${siteOrigin.replace(/\/$/, "")}/auth/callback/`],
        logoutUrls: [siteOrigin],
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    const monitors = new dynamodb.Table(this, "Monitors", {
      tableName: "pulsewatch-monitors",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sortKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const checks = new dynamodb.Table(this, "Checks", {
      tableName: "pulsewatch-checks",
      partitionKey: { name: "monitorId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "checkedAt", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const incidents = new dynamodb.Table(this, "Incidents", {
      tableName: "pulsewatch-incidents",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sortKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    incidents.addGlobalSecondaryIndex({
      indexName: "incidentId-index",
      partitionKey: { name: "incidentId", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    const statusPages = new dynamodb.Table(this, "StatusPages", {
      tableName: "pulsewatch-status-pages",
      partitionKey: { name: "slug", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    statusPages.addGlobalSecondaryIndex({
      indexName: "userId-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    const analytics = new dynamodb.Table(this, "Analytics", {
      tableName: "pulsewatch-analytics",
      partitionKey: { name: "siteId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sortKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const alertTopic = new sns.Topic(this, "Alerts", { topicName: "pulsewatch-alerts" });
    const notificationEmail = String(this.node.tryGetContext("notificationEmail") ?? "").trim();
    if (notificationEmail) alertTopic.addSubscription(new snsSubscriptions.EmailSubscription(notificationEmail));
    const scheduleGroup = new scheduler.ScheduleGroup(this, "MonitorSchedules", { scheduleGroupName: "pulsewatch-monitor-checks" });
    const checker = new lambda.Function(this, "Checker", {
      functionName: "pulsewatch-checker",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "checker.handler",
      code: lambda.Code.fromAsset(path.join(projectRoot, "backend/functions")),
      timeout: Duration.seconds(20),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, "CheckerLogs", { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
      environment: { MONITORS_TABLE: monitors.tableName, CHECKS_TABLE: checks.tableName, INCIDENTS_TABLE: incidents.tableName, SNS_TOPIC_ARN: alertTopic.topicArn },
    });
    const schedulerRole = new iam.Role(this, "SchedulerInvokeRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    checker.grantInvoke(schedulerRole);
    const api = new lambda.Function(this, "Api", {
      functionName: "pulsewatch-api",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "api.handler",
      code: lambda.Code.fromAsset(path.join(projectRoot, "backend/functions")),
      timeout: Duration.seconds(12),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
      environment: {
        MONITORS_TABLE: monitors.tableName,
        CHECKS_TABLE: checks.tableName,
        INCIDENTS_TABLE: incidents.tableName,
        STATUS_PAGES_TABLE: statusPages.tableName,
        ANALYTICS_TABLE: analytics.tableName,
        ANALYTICS_SITES: JSON.stringify(Object.fromEntries(Object.entries(analyticsSites).map(([siteId, site]) => [siteId, site.origin]))),
        ANALYTICS_SITE_ORIGINS: JSON.stringify(Object.fromEntries(Object.entries(analyticsSites).map(([siteId, site]) => [siteId, site.origins]))),
        SCHEDULE_GROUP: scheduleGroup.scheduleGroupName,
        SCHEDULER_INVOKE_ROLE_ARN: schedulerRole.roleArn,
        CHECK_FUNCTION_ARN: checker.functionArn,
        CHECK_FUNCTION_NAME: checker.functionName,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_DOMAIN: `${authDomain}.auth.${this.region}.amazoncognito.com`,
      },
    });
    monitors.grantReadWriteData(api);
    checks.grantReadData(api);
    incidents.grantReadWriteData(api);
    statusPages.grantReadWriteData(api);
    analytics.grantReadWriteData(api);
    monitors.grantReadWriteData(checker);
    checks.grantWriteData(checker);
    incidents.grantReadWriteData(checker);
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ["scheduler:GetSchedule", "scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule"], resources: [`${scheduleGroup.scheduleGroupArn}/*`] }));
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [schedulerRole.roleArn], conditions: { StringEquals: { "iam:PassedToService": "scheduler.amazonaws.com" } } }));
    checker.grantInvoke(api);
    alertTopic.grantPublish(checker);

    const authorizer = new authorizers.HttpJwtAuthorizer("CognitoJwt", `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, { jwtAudience: [userPoolClient.userPoolClientId] });
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "pulsewatch-api",
      createDefaultStage: false,
      corsPreflight: { allowOrigins: originsList, allowMethods: [apigwv2.CorsHttpMethod.ANY], allowHeaders: ["authorization", "content-type"], maxAge: Duration.hours(1) },
    });
    httpApi.addStage("DefaultStage", { stageName: "$default", autoDeploy: true, throttle: { burstLimit: 20, rateLimit: 10 } });
    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", api);
    const route = (pathName: string, methods: apigwv2.HttpMethod[], auth = true) => httpApi.addRoutes({ path: pathName, methods, integration, ...(auth ? { authorizer } : {}) });
    route("/api/config", [apigwv2.HttpMethod.GET], false);
    route("/api/demo/monitors", [apigwv2.HttpMethod.GET], false);
    route("/api/demo/monitors/{id}/checks", [apigwv2.HttpMethod.GET], false);
    route("/api/demo/incidents", [apigwv2.HttpMethod.GET], false);
    route("/api/demo/analytics", [apigwv2.HttpMethod.GET], false);
    route("/api/analytics/visit", [apigwv2.HttpMethod.POST], false);
    route("/api/status/{slug}", [apigwv2.HttpMethod.GET], false);
    route("/api/monitors", [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST]);
    route("/api/monitors/{id}", [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE]);
    route("/api/monitors/{id}/checks", [apigwv2.HttpMethod.GET]);
    route("/api/monitors/{id}/check", [apigwv2.HttpMethod.POST]);
    route("/api/incidents", [apigwv2.HttpMethod.GET]);
    route("/api/status-page", [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE]);

    const bucket = new s3.Bucket(this, "Website", {
      bucketName: `pulsewatch-web-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('/api/') === 0 || uri.indexOf('/_next/') === 0 || uri === '/favicon.svg' || uri === '/pulsewatch-mountains.png' || uri === '/pulsewatch-analytics.js' || uri === '/index.html') return request;
  request.uri = '/index.html';
  return request;
}`),
    });
    const apiCachePolicy = new cloudfront.CachePolicy(this, "ApiCachePolicy", {
      cachePolicyName: "pulsewatch-api-minimal-cache",
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      // Keep the default uncached; a one-second ceiling allows CloudFront to
      // forward Authorization and its generated country header in this policy.
      maxTtl: Duration.seconds(1),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization", "CloudFront-Viewer-Country"),
    });
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(bucket), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, compress: true, responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS, functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }] },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", httpApi.apiEndpoint))),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: new cloudfront.OriginRequestPolicy(this, "ApiOriginRequestPolicy", {
            headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
              "Origin",
              "Access-Control-Request-Headers",
              "Access-Control-Request-Method",
            ),
          }),
        },
      },
    });
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset(path.join(projectRoot, "out"))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    new cdk.CfnOutput(this, "WebsiteUrl", { value: `https://${distribution.domainName}` });
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoDomain", { value: `https://${authDomain}.auth.${this.region}.amazoncognito.com` });
    new cdk.CfnOutput(this, "AlertTopicArn", { value: alertTopic.topicArn });
  }
}
