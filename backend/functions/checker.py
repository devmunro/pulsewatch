"""Scheduled and manual monitor-check Lambda."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from shared.http import check_url

dynamodb = boto3.resource("dynamodb")


def MONITORS():
    return dynamodb.Table(os.environ["MONITORS_TABLE"])


def CHECKS():
    return dynamodb.Table(os.environ["CHECKS_TABLE"])


def INCIDENTS():
    return dynamodb.Table(os.environ["INCIDENTS_TABLE"])


sns = boto3.client("sns")


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    user_id = event.get("userId")
    monitor_id = event.get("monitorId")
    if not user_id or not monitor_id:
        return {"error": "A monitor owner and ID are required"}
    monitor = (
        MONITORS().get_item(Key={"userId": user_id, "sortKey": f"MONITOR#{monitor_id}"}).get("Item")
    )
    if not monitor or not monitor.get("enabled", True):
        return {"skipped": True, "reason": "Monitor is missing or paused"}

    now = _now()
    previous = monitor.get("lastCheckedAt")
    if previous and event.get("source") != "pulsewatch.manual":
        previous_time = datetime.fromisoformat(str(previous).replace("Z", "+00:00"))
        due_at = previous_time + timedelta(minutes=int(monitor.get("intervalMinutes", 5)))
        if now < due_at:
            return {"skipped": True, "reason": "Check interval has not elapsed"}

    lease_until = int(now.timestamp()) + 30
    try:
        MONITORS().update_item(
            Key={"userId": user_id, "sortKey": f"MONITOR#{monitor_id}"},
            UpdateExpression="SET checkLeaseUntil = :lease",
            ConditionExpression="attribute_not_exists(checkLeaseUntil) OR checkLeaseUntil < :now",
            ExpressionAttributeValues={":lease": lease_until, ":now": int(now.timestamp())},
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {"skipped": True, "reason": "A check is already in progress"}
        raise

    result = check_url(str(monitor["url"]))
    timestamp = _iso(now)
    checked_at = int(now.timestamp())
    item = {
        "monitorId": monitor_id,
        "checkedAt": f"{checked_at:010d}#{timestamp}",
        "userId": user_id,
        "status": "UP" if result["ok"] else "DOWN",
        "statusCode": result["statusCode"] if result["statusCode"] is not None else 0,
        "responseTimeMs": result["responseTimeMs"],
        "reason": result["reason"] or "",
        "timestamp": timestamp,
        "expiresAt": checked_at + 90 * 24 * 60 * 60,
    }
    CHECKS().put_item(Item=item)
    status = "UP" if result["ok"] else "DOWN"
    MONITORS().update_item(
        Key={"userId": user_id, "sortKey": f"MONITOR#{monitor_id}"},
        UpdateExpression="SET #status = :status, lastCheckedAt = :checked, lastStatusCode = :code, lastResponseTimeMs = :latency, updatedAt = :checked REMOVE checkLeaseUntil",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":status": status,
            ":checked": timestamp,
            ":code": item["statusCode"],
            ":latency": item["responseTimeMs"],
        },
    )

    if not result["ok"] and not monitor.get("activeIncidentId"):
        _open_incident(monitor, result, timestamp)
    elif result["ok"] and monitor.get("activeIncidentId"):
        _resolve_incident(monitor, timestamp)
    return {
        "monitorId": monitor_id,
        "status": status,
        "timestamp": timestamp,
        "statusCode": item["statusCode"],
        "responseTimeMs": item["responseTimeMs"],
    }


def _open_incident(monitor: dict[str, Any], result: dict[str, Any], timestamp: str) -> None:
    user_id = monitor["userId"]
    monitor_id = monitor["monitorId"]
    incident_id = f"{int(_now().timestamp())}-{monitor_id}"
    try:
        MONITORS().update_item(
            Key={"userId": user_id, "sortKey": f"MONITOR#{monitor_id}"},
            UpdateExpression="SET activeIncidentId = :id",
            ConditionExpression="attribute_not_exists(activeIncidentId)",
            ExpressionAttributeValues={":id": incident_id},
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return
        raise
    reason = result["reason"] or f"HTTP {result['statusCode']}"
    item = {
        "userId": user_id,
        "sortKey": f"{timestamp}#{incident_id}",
        "incidentId": incident_id,
        "monitorId": monitor_id,
        "monitorName": monitor["name"],
        "startedAt": timestamp,
        "status": "OPEN",
        "reason": reason,
        "statusCode": result["statusCode"] or 0,
    }
    INCIDENTS().put_item(Item=item)
    topic = os.environ.get("SNS_TOPIC_ARN")
    if topic:
        sns.publish(
            TopicArn=topic,
            Subject=f"PulseWatch incident: {monitor['name']}",
            Message=json.dumps(item, default=str),
        )


def _resolve_incident(monitor: dict[str, Any], timestamp: str) -> None:
    user_id = monitor["userId"]
    incident_id = monitor["activeIncidentId"]
    result = INCIDENTS().query(
        IndexName="incidentId-index",
        KeyConditionExpression=Key("incidentId").eq(incident_id),
        Limit=1,
    )
    incident = next(iter(result.get("Items", [])), None)
    if incident:
        started = datetime.fromisoformat(incident["startedAt"].replace("Z", "+00:00"))
        ended = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        INCIDENTS().update_item(
            Key={"userId": user_id, "sortKey": incident["sortKey"]},
            UpdateExpression="SET #status = :resolved, resolvedAt = :resolvedAt, durationSeconds = :duration",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":resolved": "RESOLVED",
                ":resolvedAt": timestamp,
                ":duration": Decimal(str(max(0, int((ended - started).total_seconds())))),
            },
        )
    MONITORS().update_item(
        Key={"userId": user_id, "sortKey": f"MONITOR#{monitor['monitorId']}"},
        UpdateExpression="REMOVE activeIncidentId",
    )
