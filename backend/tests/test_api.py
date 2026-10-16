import importlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-west-2")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    monkeypatch.syspath_prepend(str(Path(__file__).parents[1] / "functions"))
    sys.modules.pop("functions.api", None)
    return importlib.import_module("functions.api")


def request(path, method="GET", body=None, claims=None):
    event = {"rawPath": path, "requestContext": {"http": {"method": method}}}
    if body is not None:
        event["body"] = body
    if claims is not None:
        event["requestContext"]["authorizer"] = {"jwt": {"claims": claims}}
    return event


def test_demo_returns_only_owner_published_monitors_and_safe_fields(api, monkeypatch):
    page = {"name": "PulseWatch Demo", "userId": "owner", "monitorIds": ["published"]}
    monitor = {
        "userId": "owner",
        "sortKey": "MONITOR#published",
        "monitorId": "published",
        "name": "Portfolio",
        "url": "https://private:secret@example.com/secret/path?token=secret",
        "status": "UP",
        "lastStatusCode": 200,
        "lastResponseTimeMs": 42,
        "intervalMinutes": 5,
        "checkLeaseUntil": 123,
    }
    monkeypatch.setattr(api, "_published_demo", lambda: (page, [monitor]))
    checks = Mock()
    checks.query.return_value = {"Items": [{"status": "UP"}, {"status": "DOWN"}]}
    monkeypatch.setattr(api, "CHECKS", lambda: checks)
    monkeypatch.setattr(
        api.lambda_client, "invoke", lambda **_: pytest.fail("demo route invoked a check")
    )
    result = api.handler(request("/api/demo/monitors"), None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["readOnly"] is True
    assert body["published"] is True
    assert body["monitors"] == [
        {
            "monitorId": "published",
            "name": "Portfolio",
            "url": "https://example.com",
            "status": "UP",
            "statusCode": 200,
            "responseTimeMs": 42,
            "lastChecked": None,
        }
    ]


def test_uptime_uses_available_real_checks_and_reports_coverage(api, monkeypatch):
    checks = Mock()
    now = int(datetime.now(UTC).timestamp())
    checks.query.return_value = {
        "Items": [
            {"status": "UP", "checkedAt": f"{now - 3600:010d}#up"}
        ] * 806
        + [{"status": "DOWN", "checkedAt": f"{now - 3600:010d}#down"}] * 807
    }
    monkeypatch.setattr(api, "CHECKS", lambda: checks)
    assert api._monitor_uptime("monitor") == (49.97, 1.0)
    checks.query.return_value = {
        "Items": [
            {"status": "UP", "checkedAt": f"{now - 1800:010d}#one"},
            {"status": "UP", "checkedAt": f"{now - 900:010d}#two"},
        ]
    }
    assert api._monitor_uptime("new-monitor") == (100.0, 0.5)
    checks.query.return_value = {"Items": []}
    assert api._monitor_uptime("empty-monitor") == (None, None)


def test_demo_check_history_requires_a_published_monitor(api, monkeypatch):
    page = {"userId": "owner"}
    monitors = [{"monitorId": "published"}]
    checks = Mock()
    checks.query.return_value = {
        "Items": [
            {
                "timestamp": "2026-10-16T12:00:00Z",
                "responseTimeMs": 42,
                "status": "UP",
                "statusCode": 200,
                "userId": "private-owner",
                "expiresAt": 123,
            }
        ]
    }
    monkeypatch.setattr(api, "_published_demo", lambda: (page, monitors))
    monkeypatch.setattr(api, "CHECKS", lambda: checks)
    result = api.handler(request("/api/demo/monitors/published/checks"), None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["checks"] == [
        {
            "timestamp": "2026-10-16T12:00:00Z",
            "responseTimeMs": 42,
            "status": "UP",
            "statusCode": 200,
        }
    ]
    assert api.handler(request("/api/demo/monitors/private/checks"), None)["statusCode"] == 404


def test_visitor_count_accepts_only_configured_site_origins(api, monkeypatch):
    monkeypatch.setenv(
        "ANALYTICS_SITES",
        '{"portfolio":"https://davefolio.vercel.app","highforce":"https://highforce.agency"}',
    )
    table = Mock()
    monkeypatch.setattr(api, "ANALYTICS", lambda: table)
    event = request("/api/analytics/visit", "POST", '{"siteId":"portfolio"}')
    event["headers"] = {
        "origin": "https://davefolio.vercel.app",
        "cloudfront-viewer-country": "GB",
    }
    event["requestContext"]["http"]["sourceIp"] = "test-client-ip"
    result = api.handler(event, None)
    assert result["statusCode"] == 202
    assert table.update_item.call_args.kwargs["Key"]["siteId"] == "portfolio"
    assert table.update_item.call_args.kwargs["Key"]["sortKey"].endswith("#GB")
    assert "test-client-ip" not in repr(table.update_item.call_args.kwargs)
    denied = request("/api/analytics/visit", "POST", '{"siteId":"portfolio"}')
    denied["headers"] = {"origin": "https://attacker.example"}
    assert api.handler(denied, None)["statusCode"] == 403


def test_highforce_www_alias_is_an_allowed_analytics_origin(api, monkeypatch):
    monkeypatch.setenv("ANALYTICS_SITES", '{"highforce":"https://highforce.agency"}')
    monkeypatch.setenv(
        "ANALYTICS_SITE_ORIGINS",
        '{"highforce":["https://highforce.agency","https://www.highforce.agency"]}',
    )
    table = Mock()
    monkeypatch.setattr(api, "ANALYTICS", lambda: table)
    event = request("/api/analytics/visit", "POST", '{"siteId":"highforce"}')
    event["headers"] = {
        "origin": "https://www.highforce.agency",
        "cloudfront-viewer-country": "GB",
    }
    assert api.handler(event, None)["statusCode"] == 202
    assert table.update_item.call_count == 1
    event["headers"]["origin"] = "https://other.example"
    assert api.handler(event, None)["statusCode"] == 403


def test_public_visitor_summary_returns_only_aggregated_country_counts(api, monkeypatch):
    monkeypatch.setenv(
        "ANALYTICS_SITES",
        '{"portfolio":"https://davefolio.vercel.app","highforce":"https://highforce.agency"}',
    )
    table = Mock()
    table.query.side_effect = [
        {"Items": [{"sortKey": "2026-10-16#GB", "pageViews": 3}]},
        {"Items": [{"sortKey": "2026-10-16#US", "pageViews": 2}]},
    ]
    monkeypatch.setattr(api, "ANALYTICS", lambda: table)
    result = api.handler(request("/api/demo/analytics"), None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["pageViews"] == 5
    assert body["countries"] == [
        {"country": "GB", "pageViews": 3},
        {"country": "US", "pageViews": 2},
    ]
    assert "userId" not in body


def test_demo_without_a_public_selection_is_empty(api, monkeypatch):
    monkeypatch.setattr(api, "_published_demo", lambda: (None, []))
    result = api.handler(request("/api/demo/monitors"), None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["readOnly"] is True
    assert body["published"] is False
    assert body["monitors"] == []


def test_demo_incidents_include_only_published_monitor_incidents(api, monkeypatch):
    page = {"userId": "owner"}
    monitors = [{"monitorId": "published"}]
    incidents = Mock()
    incidents.query.return_value = {
        "Items": [
            {
                "userId": "owner",
                "sortKey": "private",
                "incidentId": "public-incident",
                "monitorId": "published",
                "monitorName": "Portfolio",
                "startedAt": "2026-10-16T12:00:00Z",
                "reason": "HTTP 500",
                "status": "RESOLVED",
                "durationSeconds": 60,
            },
            {"incidentId": "private-incident", "monitorId": "not-published"},
        ]
    }
    monkeypatch.setattr(api, "_published_demo", lambda: (page, monitors))
    monkeypatch.setattr(api, "INCIDENTS", lambda: incidents)
    result = api.handler(request("/api/demo/incidents"), None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["readOnly"] is True
    assert [incident["incidentId"] for incident in body["incidents"]] == ["public-incident"]
    assert "userId" not in body["incidents"][0]
    assert "sortKey" not in body["incidents"][0]


def test_public_status_page_does_not_return_private_monitor_fields(api, monkeypatch):
    page = {"userId": "owner", "slug": "pulsewatch-demo", "name": "Public demo", "monitorIds": ["m1"]}
    monitor = {
        "userId": "owner",
        "sortKey": "MONITOR#m1",
        "monitorId": "m1",
        "name": "Portfolio",
        "url": "https://example.com/private/path?secret=token",
        "status": "UP",
        "lastStatusCode": 200,
        "intervalMinutes": 5,
    }
    table = Mock()
    table.get_item.return_value = {"Item": page}
    monkeypatch.setattr(api, "STATUS_PAGES", lambda: table)
    monkeypatch.setattr(api, "_monitor", lambda *_: monitor)
    checks = Mock()
    checks.query.return_value = {"Items": []}
    monkeypatch.setattr(api, "CHECKS", lambda: checks)
    result = api.handler(request("/api/status/pulsewatch-demo"), None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["monitors"][0]["url"] == "https://example.com"
    assert "userId" not in body["monitors"][0]
    assert "sortKey" not in body["monitors"][0]
    assert "intervalMinutes" not in body["monitors"][0]


def test_guest_cannot_create_monitor_or_trigger_check(api, monkeypatch):
    monkeypatch.setattr(
        api.lambda_client, "invoke", lambda **_: pytest.fail("guest invoked a check")
    )
    result = api.handler(
        request("/api/monitors", "POST", '{"name":"x","url":"https://example.com"}'), None
    )
    assert result["statusCode"] == 401


def test_monitor_creation_enforces_five_minute_minimum(api, monkeypatch):
    monkeypatch.setattr(
        api, "resolve_public_target", lambda _url: ("example.com", 443, "1.1.1.1", "/")
    )
    event = request(
        "/api/monitors",
        "POST",
        '{"name":"site","url":"https://example.com","intervalMinutes":4}',
        {"sub": "verified-owner"},
    )
    result = api.handler(event, None)
    assert result["statusCode"] == 400
    assert "at least 5 minutes" in json.loads(result["body"])["error"]


def test_monitor_creation_enforces_five_monitor_limit(api, monkeypatch):
    table = Mock()
    table.name = "pulsewatch-monitors"
    table.meta.client.transact_write_items.side_effect = ClientError(
        {"Error": {"Code": "TransactionCanceledException", "Message": "limit"}},
        "TransactWriteItems",
    )
    monkeypatch.setattr(api, "MONITORS", lambda: table)
    monkeypatch.setattr(
        api, "resolve_public_target", lambda _url: ("example.com", 443, "1.1.1.1", "/")
    )
    event = request(
        "/api/monitors",
        "POST",
        '{"name":"site","url":"https://example.com","intervalMinutes":5}',
        {"sub": "verified-owner"},
    )
    result = api.handler(event, None)
    assert result["statusCode"] == 409
    transaction = table.meta.client.transact_write_items.call_args.kwargs["TransactItems"]
    assert transaction[0]["Update"]["ExpressionAttributeValues"][":limit"]["N"] == "5"


def test_monitor_lookup_is_scoped_to_verified_owner(api, monkeypatch):
    table = Mock()
    table.get_item.return_value = {}
    monkeypatch.setattr(api, "MONITORS", lambda: table)
    result = api.handler(
        request("/api/monitors/monitor-123", claims={"sub": "verified-owner"}), None
    )
    assert result["statusCode"] == 404
    assert table.get_item.call_args.kwargs["Key"]["userId"] == "verified-owner"


def test_owner_is_derived_only_from_verified_gateway_claims(api):
    event = request("/api/monitors", claims={"sub": "verified-owner", "email": "user@example.com"})
    event["body"] = '{"userId":"attacker","monitorId":"someone-elses"}'
    assert api._claims(event) == {"userId": "verified-owner"}
    assert api._claims(request("/api/monitors")) is None


def test_body_must_be_a_json_object(api):
    with pytest.raises(ValueError, match="JSON object"):
        api._body({"body": "[]"})
