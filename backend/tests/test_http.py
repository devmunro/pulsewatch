import socket

import pytest

from functions.shared.http import UnsafeTarget, resolve_public_target


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/file",
        "http://localhost/",
        "http://service.local/",
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://192.168.1.4/",
        "http://[::1]/",
        "http://user:pass@example.com/",
        "https://example.com:8443/",
        "https://example.com:0/",
        "https://example.com/#fragment",
    ],
)
def test_rejects_unsafe_urls(url):
    with pytest.raises(UnsafeTarget):
        resolve_public_target(url)


def test_rejects_dns_names_that_resolve_to_private_addresses(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.1.2.3", 80))],
    )
    with pytest.raises(UnsafeTarget, match="Private"):
        resolve_public_target("https://private.example/")


def test_rejects_mixed_public_and_private_dns_answers(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.3", 443)),
        ],
    )
    with pytest.raises(UnsafeTarget, match="Private"):
        resolve_public_target("https://mixed.example/")


def test_returns_resolved_public_address(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))],
    )
    assert resolve_public_target("https://monitor.example/health?ready=1") == (
        "monitor.example",
        443,
        "1.1.1.1",
        "/health?ready=1",
    )
