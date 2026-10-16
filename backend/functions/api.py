"""HTTP API Lambda for demo, authenticated monitors, checks, incidents and status pages."""

from __future__ import annotations

import json
import math
import os
import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from shared.http import UnsafeTarget, resolve_public_target

dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")
scheduler = boto3.client("scheduler")


def MONITORS():
    return dynamodb.Table(os.environ["MONITORS_TABLE"])


def CHECKS():
    return dynamodb.Table(os.environ["CHECKS_TABLE"])


def INCIDENTS():
    return dynamodb.Table(os.environ["INCIDENTS_TABLE"])


def STATUS_PAGES():
    return dynamodb.Table(os.environ["STATUS_PAGES_TABLE"])


def ANALYTICS():
    return dynamodb.Table(os.environ["ANALYTICS_TABLE"])


MAX_MONITORS = 5
MIN_INTERVAL = 5
PUBLIC_DEMO_SLUG = "pulsewatch-demo"


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def response(status: int, body: Any) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, default=_json_default),
    }


def _body(event: dict[str, Any]) -> dict[str, Any]:
    try:
        value = json.loads(event.get("body") or "{}")
        if not isinstance(value, dict):
            raise ValueError
        return value
    except (json.JSONDecodeError, ValueError):
        raise ValueError("Request body must be a JSON object") from None


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _claims(event: dict[str, Any]) -> dict[str, str] | None:
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        user_id = claims.get("sub")
        return {"userId": str(user_id)} if user_id else None
    except (KeyError, TypeError):
        return None


def _monitor(user_id: str, monitor_id: str) -> dict[str, Any] | None:
    result = MONITORS().get_item(Key={"userId": user_id, "sortKey": f"MONITOR#{monitor_id}"})
    return result.get("Item")


def _safe_slug(value: Any) -> str:
    slug = str(value or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?", slug):
        raise ValueError("Slug must be 1–48 lowercase letters, numbers, or hyphens")
    return slug


def _create_schedule(item: dict[str, Any]) -> None:
    if not item.get("enabled", True):
        return
    name = f"pw-{item['userId'][:12]}-{item['monitorId']}"
    schedule_args = {
        "Name": name,
        "GroupName": os.environ["SCHEDULE_GROUP"],
        "ScheduleExpression": f"rate({int(item['intervalMinutes'])} minutes)",
        "FlexibleTimeWindow": {"Mode": "OFF"},
        "State": "ENABLED",
        "Target": {
            "Arn": os.environ["CHECK_FUNCTION_ARN"],
            "RoleArn": os.environ["SCHEDULER_INVOKE_ROLE_ARN"],
            "Input": json.dumps(
                {
                    "source": "pulsewatch.schedule",
                    "userId": item["userId"],
                    "monitorId": item["monitorId"],
                }
            ),
        },
        "Description": "Scheduled PulseWatch monitor check",
    }
    try:
        scheduler.get_schedule(Name=name, GroupName=os.environ["SCHEDULE_GROUP"])
        scheduler.update_schedule(**schedule_args)
    except scheduler.exceptions.ResourceNotFoundException:
        scheduler.create_schedule(**schedule_args)


def _delete_schedule(user_id: str, monitor_id: str) -> None:
    name = f"pw-{user_id[:12]}-{monitor_id}"
    try:
        scheduler.delete_schedule(Name=name, GroupName=os.environ["SCHEDULE_GROUP"])
    except scheduler.exceptions.ResourceNotFoundException:
        pass


def _list_monitors(user_id: str) -> list[dict[str, Any]]:
    result = MONITORS().query(
        KeyConditionExpression=Key("userId").eq(user_id) & Key("sortKey").begins_with("MONITOR#")
    )
    return result.get("Items", [])


def _published_demo() -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Return only monitors the owner explicitly selected for the public demo."""
    page = STATUS_PAGES().get_item(Key={"slug": PUBLIC_DEMO_SLUG}).get("Item")
    if not page:
        return None, []
    monitors = [
        item
        for monitor_id in page.get("monitorIds", [])
        if (item := _monitor(page["userId"], str(monitor_id))) is not None
    ]
    return page, monitors


def _monitor_uptime(monitor_id: str, interval_minutes: int = MIN_INTERVAL) -> float | None:
    """Calculate seven-day uptime from stored real checks; omit it before data exists."""
    cutoff = int((datetime.now(UTC) - timedelta(days=7)).timestamp())
    result = CHECKS().query(
        KeyConditionExpression=Key("monitorId").eq(monitor_id)
        & Key("checkedAt").gte(f"{cutoff:010d}#")
    )
    checks = result.get("Items", [])
    valid_checks = [item for item in checks if item.get("status") in {"UP", "DOWN"}]
    expected_checks = math.ceil(7 * 24 * 60 / max(interval_minutes, MIN_INTERVAL))
    if len(valid_checks) < math.ceil(expected_checks * 0.8):
        return None
    return round(100 * sum(item["status"] == "UP" for item in valid_checks) / len(valid_checks), 2)


def _public_monitor(item: dict[str, Any], uptime7d: float | None = None) -> dict[str, Any]:
    """Project a private monitor record to fields safe for its public status view."""
    from urllib.parse import urlsplit

    parsed = urlsplit(str(item.get("url", "")))
    hostname = parsed.hostname or ""
    if parsed.port:
        hostname = f"{hostname}:{parsed.port}"
    public_url = f"{parsed.scheme}://{hostname}" if parsed.scheme and hostname else ""
    public = {
        "monitorId": item["monitorId"],
        "name": item["name"],
        "url": public_url,
        "status": item.get("status", "UNKNOWN"),
        "statusCode": item.get("lastStatusCode"),
        "responseTimeMs": item.get("lastResponseTimeMs"),
        "lastChecked": item.get("lastCheckedAt"),
    }
    if uptime7d is not None:
        public["uptime7d"] = uptime7d
    return public


def _public_check(item: dict[str, Any]) -> dict[str, Any]:
    """Expose only fields needed to chart check history."""
    return {
        "timestamp": item.get("timestamp"),
        "responseTimeMs": item.get("responseTimeMs"),
        "status": item.get("status"),
        "statusCode": item.get("statusCode"),
    }


def _public_incident(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "incidentId": item.get("incidentId"),
        "monitorId": item.get("monitorId"),
        "monitorName": item.get("monitorName", "Monitor"),
        "startedAt": item.get("startedAt"),
        "reason": item.get("reason", "Service issue"),
        "status": item.get("status", "OPEN"),
        "durationSeconds": item.get("durationSeconds"),
    }


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")
    if path.startswith("/api/"):
        path = path[4:]
    parts = [part for part in path.split("/") if part]
    try:
        if path == "/config" and method == "GET":
            return response(
                200,
                {
                    "cognitoClientId": os.environ.get("USER_POOL_CLIENT_ID", ""),
                    "cognitoDomain": os.environ.get("COGNITO_DOMAIN", ""),
                },
            )
        if path == "/demo/monitors" and method == "GET":
            page, monitors = _published_demo()
            return response(
                200,
                {
                    "monitors": [
                        _public_monitor(
                            item,
                            _monitor_uptime(item["monitorId"], int(item.get("intervalMinutes", 5))),
                        )
                        for item in monitors
                    ],
                    "readOnly": True,
                    "published": page is not None,
                    "name": page.get("name") if page else None,
                },
            )
        if path == "/demo/incidents" and method == "GET":
            page, monitors = _published_demo()
            incidents = []
            if page:
                monitor_ids = {item["monitorId"] for item in monitors}
                result = INCIDENTS().query(
                    KeyConditionExpression=Key("userId").eq(page["userId"]),
                    ScanIndexForward=False,
                    Limit=100,
                )
                incidents = [
                    _public_incident(item)
                    for item in result.get("Items", [])
                    if item.get("monitorId") in monitor_ids
                ]
            return response(200, {"incidents": incidents, "readOnly": True})
        if path == "/analytics/visit" and method == "POST":
            body = _body(event)
            site_id = str(body.get("siteId", ""))
            sites = json.loads(os.environ.get("ANALYTICS_SITES", "{}"))
            allowed_sites = json.loads(os.environ.get("ANALYTICS_SITE_ORIGINS", "{}"))
            headers = {str(k).lower(): str(v) for k, v in event.get("headers", {}).items()}
            allowed_origins = allowed_sites.get(site_id, [sites.get(site_id)])
            if isinstance(allowed_origins, str):
                allowed_origins = [allowed_origins]
            if site_id not in sites or headers.get("origin") not in allowed_origins:
                return response(403, {"error": "This site is not enabled for visitor counts"})
            country = headers.get("cloudfront-viewer-country", "ZZ").upper()
            if not re.fullmatch(r"[A-Z]{2}", country):
                country = "ZZ"
            now = datetime.now(UTC)
            day = now.strftime("%Y-%m-%d")
            ANALYTICS().update_item(
                Key={"siteId": site_id, "sortKey": f"{day}#{country}"},
                UpdateExpression="SET expiresAt = :expires, updatedAt = :now ADD pageViews :one",
                ExpressionAttributeValues={
                    ":one": 1,
                    ":expires": int(now.timestamp()) + 90 * 24 * 60 * 60,
                    ":now": _now(),
                },
            )
            return response(202, {"accepted": True})
        if path == "/demo/analytics" and method == "GET":
            cutoff = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")
            sites = json.loads(os.environ.get("ANALYTICS_SITES", "{}"))
            by_country: dict[str, int] = {}
            by_site: dict[str, int] = {}
            for site_id in sites:
                result = ANALYTICS().query(
                    KeyConditionExpression=Key("siteId").eq(site_id)
                    & Key("sortKey").gte(cutoff)
                )
                for item in result.get("Items", []):
                    country = item["sortKey"].split("#", 1)[-1]
                    count = int(item.get("pageViews", 0))
                    by_country[country] = by_country.get(country, 0) + count
                    by_site[site_id] = by_site.get(site_id, 0) + count
            countries = [
                {"country": country, "pageViews": count}
                for country, count in sorted(by_country.items(), key=lambda item: item[1], reverse=True)
            ]
            return response(
                200,
                {
                    "rangeDays": 30,
                    "pageViews": sum(by_country.values()),
                    "countries": countries,
                    "sites": [
                        {"siteId": site_id, "pageViews": by_site.get(site_id, 0)}
                        for site_id in sites
                    ],
                },
            )
        if len(parts) == 4 and parts[:2] == ["demo", "monitors"] and parts[3] == "checks" and method == "GET":
            page, monitors = _published_demo()
            monitor_id = parts[2]
            if not page or not any(item["monitorId"] == monitor_id for item in monitors):
                return response(404, {"error": "Published monitor not found"})
            result = CHECKS().query(
                KeyConditionExpression=Key("monitorId").eq(monitor_id),
                ScanIndexForward=False,
                Limit=500,
            )
            return response(
                200,
                {"checks": [_public_check(item) for item in result.get("Items", [])]},
            )
        if len(parts) == 2 and parts[0] == "status" and method == "GET":
            slug = _safe_slug(parts[1])
            page = STATUS_PAGES().get_item(Key={"slug": slug}).get("Item")
            if not page:
                return response(404, {"error": "Status page not found"})
            monitors = [
                _monitor(page["userId"], monitor_id) for monitor_id in page.get("monitorIds", [])
            ]
            return response(
                200,
                {
                    "name": page["name"],
                    "monitors": [
                        _public_monitor(
                            m, _monitor_uptime(m["monitorId"], int(m.get("intervalMinutes", 5)))
                        )
                        for m in monitors
                        if m
                    ],
                },
            )

        claims = _claims(event)
        if not claims:
            return response(401, {"error": "Authentication is required"})
        user_id = claims["userId"]

        if path == "/monitors" and method == "GET":
            monitors = _list_monitors(user_id)
            return response(
                200,
                {
                    "monitors": [
                        item
                        | {
                            "uptime7d": _monitor_uptime(
                                item["monitorId"], int(item.get("intervalMinutes", 5))
                            )
                        }
                        for item in monitors
                    ]
                },
            )
        if path == "/monitors" and method == "POST":
            body = _body(event)
            name = str(body.get("name", "")).strip()
            url = str(body.get("url", "")).strip()
            interval = int(body.get("intervalMinutes", MIN_INTERVAL))
            if not name or len(name) > 80:
                return response(400, {"error": "Name must be 1–80 characters"})
            if interval < MIN_INTERVAL or interval > 1440:
                return response(400, {"error": "Check interval must be at least 5 minutes"})
            resolve_public_target(url)
            monitor_id = str(uuid.uuid4())
            now = _now()
            item = {
                "userId": user_id,
                "sortKey": f"MONITOR#{monitor_id}",
                "monitorId": monitor_id,
                "name": name,
                "url": url,
                "intervalMinutes": interval,
                "enabled": True,
                "status": "UNKNOWN",
                "createdAt": now,
                "updatedAt": now,
            }
            try:
                MONITORS().meta.client.transact_write_items(
                    TransactItems=[
                        {
                            "Update": {
                                "TableName": MONITORS().name,
                                "Key": {"userId": {"S": user_id}, "sortKey": {"S": "USER#META"}},
                                "UpdateExpression": "ADD monitorCount :one",
                                "ConditionExpression": "attribute_not_exists(monitorCount) OR monitorCount < :limit",
                                "ExpressionAttributeValues": {
                                    ":one": {"N": "1"},
                                    ":limit": {"N": str(MAX_MONITORS)},
                                },
                            }
                        },
                        {
                            "Put": {
                                "TableName": MONITORS().name,
                                "Item": {key: _av(value) for key, value in item.items()},
                                "ConditionExpression": "attribute_not_exists(userId) AND attribute_not_exists(sortKey)",
                            }
                        },
                    ]
                )
            except ClientError as error:
                if error.response["Error"]["Code"] == "TransactionCanceledException":
                    return response(
                        409, {"error": "Monitor limit reached or monitor already exists"}
                    )
                raise
            _create_schedule(item)
            return response(201, {"monitor": item})

        if len(parts) >= 2 and parts[0] == "monitors":
            monitor_id = parts[1]
            item = _monitor(user_id, monitor_id)
            if not item:
                return response(404, {"error": "Monitor not found"})
            if len(parts) == 2 and method == "GET":
                return response(200, {"monitor": item})
            if len(parts) == 2 and method == "PATCH":
                body = _body(event)
                allowed = {"name", "url", "intervalMinutes", "enabled"}
                if set(body) - allowed or not body:
                    return response(
                        400,
                        {"error": "Only name, url, intervalMinutes, and enabled may be updated"},
                    )
                updates = {}
                if "name" in body:
                    name = str(body["name"]).strip()
                    if not name or len(name) > 80:
                        return response(400, {"error": "Name must be 1–80 characters"})
                    updates["name"] = name
                if "url" in body:
                    url = str(body["url"]).strip()
                    resolve_public_target(url)
                    updates["url"] = url
                if "intervalMinutes" in body:
                    interval = int(body["intervalMinutes"])
                    if interval < MIN_INTERVAL or interval > 1440:
                        return response(400, {"error": "Check interval must be at least 5 minutes"})
                    updates["intervalMinutes"] = interval
                if "enabled" in body:
                    updates["enabled"] = bool(body["enabled"])
                update_expression = (
                    "SET " + ", ".join(f"#{k} = :{k}" for k in updates) + ", updatedAt = :now"
                )
                MONITORS().update_item(
                    Key={"userId": user_id, "sortKey": f"MONITOR#{monitor_id}"},
                    UpdateExpression=update_expression,
                    ExpressionAttributeNames={f"#{k}": k for k in updates},
                    ExpressionAttributeValues={f":{k}": v for k, v in updates.items()}
                    | {":now": _now()},
                )
                item.update(updates)
                _create_schedule(item) if item.get("enabled") else _delete_schedule(
                    user_id, monitor_id
                )
                return response(200, {"monitor": item})
            if len(parts) == 2 and method == "DELETE":
                _delete_schedule(user_id, monitor_id)
                MONITORS().meta.client.transact_write_items(
                    TransactItems=[
                        {
                            "Delete": {
                                "TableName": MONITORS().name,
                                "Key": {
                                    "userId": {"S": user_id},
                                    "sortKey": {"S": f"MONITOR#{monitor_id}"},
                                },
                            }
                        },
                        {
                            "Update": {
                                "TableName": MONITORS().name,
                                "Key": {"userId": {"S": user_id}, "sortKey": {"S": "USER#META"}},
                                "UpdateExpression": "ADD monitorCount :minus",
                                "ExpressionAttributeValues": {
                                    ":minus": {"N": "-1"},
                                    ":zero": {"N": "0"},
                                },
                                "ConditionExpression": "monitorCount >= :zero",
                            }
                        },
                    ]
                )
                return response(204, {})
            if len(parts) == 3 and parts[2] == "checks" and method == "GET":
                result = CHECKS().query(
                    KeyConditionExpression=Key("monitorId").eq(monitor_id),
                    ScanIndexForward=False,
                    Limit=100,
                )
                return response(
                    200, {"checks": [_public_check(item) for item in result.get("Items", [])]}
                )
            if len(parts) == 3 and parts[2] == "check" and method == "POST":
                result = lambda_client.invoke(
                    FunctionName=os.environ["CHECK_FUNCTION_NAME"],
                    InvocationType="RequestResponse",
                    Payload=json.dumps(
                        {"source": "pulsewatch.manual", "userId": user_id, "monitorId": monitor_id}
                    ).encode(),
                )
                result_payload = json.loads(result["Payload"].read() or b"{}")
                return response(200 if result.get("StatusCode") == 200 else 502, result_payload)

        if path == "/incidents" and method == "GET":
            result = INCIDENTS().query(
                KeyConditionExpression=Key("userId").eq(user_id), ScanIndexForward=False, Limit=100
            )
            return response(200, {"incidents": result.get("Items", [])})
        if path == "/status-page" and method == "GET":
            result = STATUS_PAGES().query(
                IndexName="userId-index", KeyConditionExpression=Key("userId").eq(user_id), Limit=1
            )
            return response(200, {"statusPage": next(iter(result.get("Items", [])), None)})
        if path == "/status-page" and method == "PUT":
            body = _body(event)
            name = str(body.get("name", "")).strip()
            slug = _safe_slug(body.get("slug"))
            monitor_ids = body.get("monitorIds", [])
            if (
                not name
                or len(name) > 80
                or not isinstance(monitor_ids, list)
                or len(monitor_ids) > MAX_MONITORS
            ):
                return response(400, {"error": "Provide a page name and up to five monitor IDs"})
            for monitor_id in monitor_ids:
                if not _monitor(user_id, str(monitor_id)):
                    return response(
                        400, {"error": "A selected monitor does not belong to this account"}
                    )
            existing = STATUS_PAGES().get_item(Key={"slug": slug}).get("Item")
            if existing and existing["userId"] != user_id:
                return response(409, {"error": "That status page URL is already in use"})
            item = {
                "userId": user_id,
                "slug": slug,
                "name": name,
                "monitorIds": monitor_ids,
                "updatedAt": _now(),
            }
            STATUS_PAGES().put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(userId) OR userId = :user",
                ExpressionAttributeValues={":user": user_id},
            )
            return response(200, {"statusPage": item})
        if path == "/status-page" and method == "DELETE":
            result = STATUS_PAGES().query(
                IndexName="userId-index", KeyConditionExpression=Key("userId").eq(user_id), Limit=1
            )
            item = next(iter(result.get("Items", [])), None)
            if item:
                STATUS_PAGES().delete_item(Key={"slug": item["slug"]})
            return response(204, {})
        return response(404, {"error": "Route not found"})
    except (ValueError, UnsafeTarget, KeyError) as error:
        return response(400, {"error": str(error)})
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return response(409, {"error": "The requested value is already in use"})
        raise


def _av(value: Any) -> dict[str, str]:
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, (int, float, Decimal)):
        return {"N": str(value)}
    if isinstance(value, list):
        return {"L": [_av(v) for v in value]}
    return {"S": str(value)}
