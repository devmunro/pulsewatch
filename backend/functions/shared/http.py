"""Outbound HTTP checks with DNS pinning to prevent SSRF and rebinding."""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import time
from urllib.parse import urljoin, urlsplit

TIMEOUT_SECONDS = 6
MAX_REDIRECTS = 4
MAX_RESPONSE_BYTES = 2048


class UnsafeTarget(ValueError):
    """The supplied URL is not safe to access from the monitoring service."""


def resolve_public_target(url: str) -> tuple[str, int, str, str]:
    """Validate a URL and resolve its host to a public IP address."""
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"}:
            raise UnsafeTarget("Only HTTP and HTTPS URLs are allowed")
        if not parsed.hostname or parsed.username or parsed.password:
            raise UnsafeTarget("A hostname is required; URL credentials are not allowed")
        if parsed.fragment:
            raise UnsafeTarget("URL fragments are not allowed")
        port = parsed.port if parsed.port is not None else (443 if parsed.scheme == "https" else 80)
        if port not in {80, 443}:
            raise UnsafeTarget("Only standard HTTP and HTTPS ports are allowed")
        host = parsed.hostname.rstrip(".").lower()
        if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
            raise UnsafeTarget("Local network targets are not allowed")

        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
            addresses = list({ipaddress.ip_address(answer[4][0]) for answer in answers})
        if not addresses or any(not address.is_global for address in addresses):
            raise UnsafeTarget("Private, reserved, and link-local IP addresses are not allowed")
        address = str(addresses[0])
        path = parsed.path or "/"
        if parsed.query:
            path += f"?{parsed.query}"
        return host, port, address, path
    except UnsafeTarget:
        raise
    except (ValueError, OSError, socket.gaierror) as error:
        raise UnsafeTarget("The URL could not be safely resolved") from error


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, address: str):
        super().__init__(host, port, timeout=TIMEOUT_SECONDS)
        self._address = address

    def connect(self) -> None:
        self.sock = socket.create_connection((self._address, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, port: int, address: str):
        super().__init__(host, port, timeout=TIMEOUT_SECONDS, context=ssl.create_default_context())
        self._address = address

    def connect(self) -> None:
        raw_socket = socket.create_connection((self._address, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def check_url(url: str) -> dict[str, int | str | bool | None]:
    """Check a URL, revalidating and pinning every redirect target."""
    current = url
    started = time.perf_counter()
    try:
        for redirect in range(MAX_REDIRECTS + 1):
            host, port, address, path = resolve_public_target(current)
            parsed = urlsplit(current)
            connection_type = (
                _PinnedHTTPSConnection if parsed.scheme == "https" else _PinnedHTTPConnection
            )
            connection = connection_type(host, port, address)
            try:
                connection.request("GET", path, headers={"User-Agent": "PulseWatch/1.0"})
                response = connection.getresponse()
                response.read(MAX_RESPONSE_BYTES)
                code = response.status
                location = response.getheader("Location")
                if code in {301, 302, 303, 307, 308} and location:
                    if redirect == MAX_REDIRECTS:
                        raise UnsafeTarget("Too many redirects")
                    current = urljoin(current, location)
                    continue
                latency = round((time.perf_counter() - started) * 1000)
                return {
                    "ok": 200 <= code < 400,
                    "statusCode": code,
                    "responseTimeMs": latency,
                    "reason": None,
                }
            finally:
                connection.close()
        raise UnsafeTarget("Too many redirects")
    except (UnsafeTarget, OSError, http.client.HTTPException, ssl.SSLError) as error:
        return {
            "ok": False,
            "statusCode": None,
            "responseTimeMs": round((time.perf_counter() - started) * 1000),
            "reason": str(error)[:240],
        }
