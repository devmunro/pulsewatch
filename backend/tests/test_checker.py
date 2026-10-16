import importlib
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import Mock

import pytest


@pytest.fixture
def checker(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-west-2")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    monkeypatch.syspath_prepend(str(Path(__file__).parents[1] / "functions"))
    sys.modules.pop("functions.checker", None)
    return importlib.import_module("functions.checker")


def test_scheduled_check_respects_monitor_interval(checker, monkeypatch):
    monitor = {
        "userId": "owner",
        "monitorId": "monitor",
        "url": "https://example.com/health",
        "lastCheckedAt": datetime.now(UTC).isoformat(),
        "intervalMinutes": 5,
    }
    table = Mock()
    table.get_item.return_value = {"Item": monitor}
    monkeypatch.setattr(checker, "MONITORS", lambda: table)
    result = checker.handler(
        {"source": "pulsewatch.schedule", "userId": "owner", "monitorId": "monitor"}, None
    )
    assert result == {"skipped": True, "reason": "Check interval has not elapsed"}
    table.update_item.assert_not_called()


def test_manual_check_can_run_before_next_scheduled_interval(checker, monkeypatch):
    monitor = {
        "userId": "owner",
        "monitorId": "monitor",
        "name": "Monitor",
        "url": "https://example.com/health",
        "lastCheckedAt": datetime.now(UTC).isoformat(),
        "intervalMinutes": 5,
    }
    monitor_table = Mock()
    monitor_table.get_item.return_value = {"Item": monitor}
    check_table = Mock()
    monkeypatch.setattr(checker, "MONITORS", lambda: monitor_table)
    monkeypatch.setattr(checker, "CHECKS", lambda: check_table)
    monkeypatch.setattr(
        checker,
        "check_url",
        lambda _url: {"ok": True, "statusCode": 200, "responseTimeMs": 42, "reason": None},
    )
    result = checker.handler(
        {"source": "pulsewatch.manual", "userId": "owner", "monitorId": "monitor"}, None
    )
    assert result["status"] == "UP"
    check_table.put_item.assert_called_once()


def test_resolving_incident_updates_history_and_clears_monitor_link(checker, monkeypatch):
    started = datetime.now(UTC) - timedelta(minutes=2)
    monitor = {"userId": "owner", "monitorId": "monitor", "activeIncidentId": "incident"}
    incidents = Mock()
    incidents.query.return_value = {
        "Items": [{"sortKey": "key", "startedAt": started.isoformat().replace("+00:00", "Z")}]
    }
    monitors = Mock()
    monkeypatch.setattr(checker, "INCIDENTS", lambda: incidents)
    monkeypatch.setattr(checker, "MONITORS", lambda: monitors)
    checker._resolve_incident(monitor, datetime.now(UTC).isoformat().replace("+00:00", "Z"))
    incidents.update_item.assert_called_once()
    assert (
        incidents.update_item.call_args.kwargs["ExpressionAttributeValues"][":resolved"]
        == "RESOLVED"
    )
    assert incidents.update_item.call_args.kwargs["ExpressionAttributeValues"][":duration"] >= 120
    assert monitors.update_item.call_args.kwargs["UpdateExpression"] == "REMOVE activeIncidentId"
