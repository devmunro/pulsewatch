#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PulseWatchStack } from "../lib/pulsewatch-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: String(app.node.tryGetContext("region") ?? "eu-west-2"),
};

new PulseWatchStack(app, "PulseWatch", { env, description: "Cost-conscious PulseWatch uptime monitoring" });
