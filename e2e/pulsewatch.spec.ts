import { expect, test, type Page, type Route } from "@playwright/test";

const publicMonitors = [
  { monitorId: "portfolio", name: "Portfolio Website", url: "https://davefolio.vercel.app", status: "UP", statusCode: 200, responseTimeMs: 122, uptime7d: 99.99, uptimeCoverageHours: 168, lastChecked: "2026-10-16T12:00:00Z" },
  { monitorId: "highforce", name: "Highforce Agency", url: "https://highforce.agency", status: "UP", statusCode: 200, responseTimeMs: 184, uptime7d: 100, uptimeCoverageHours: 3.5, lastChecked: "2026-10-16T12:00:00Z" },
];
type MockMonitor = { monitorId: string; name: string; url: string; status: string; statusCode?: number; responseTimeMs?: number; uptime7d?: number; uptimeCoverageHours?: number; lastChecked?: string; enabled?: boolean; intervalMinutes?: number };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockPublicApi(page: Page, analytics: "empty" | "error" = "empty") {
  await page.route("**/api/demo/monitors", (route) => json(route, { monitors: publicMonitors }));
  await page.route("**/api/demo/incidents", (route) => json(route, { incidents: [] }));
  await page.route("**/api/demo/analytics", (route) => analytics === "error"
    ? json(route, { error: "Unavailable" }, 503)
    : json(route, { rangeDays: 30, pageViews: 0, countries: [], sites: [{ siteId: "portfolio", pageViews: 0 }, { siteId: "highforce", pageViews: 0 }] }));
  await page.route("**/api/demo/monitors/*/checks", (route) => json(route, { checks: [] }));
}

async function openDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore live demo" }).click();
  await expect(page).toHaveURL(/\/dashboard\/$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

test("public showcase contains only the two real sites and is read-only", async ({ page }) => {
  await mockPublicApi(page);
  await openDemo(page);

  const mapAsset = await page.request.get("/world-map.svg");
  expect(mapAsset.ok()).toBeTruthy();
  expect(mapAsset.headers()["content-type"]).toContain("image/svg+xml");
  expect(await mapAsset.text()).toContain("<svg");

  await expect(page.getByRole("row", { name: /Portfolio Website/ })).toContainText("122 ms");
  await expect(page.getByRole("row", { name: /Highforce Agency/ })).toContainText("184 ms");
  await expect(page.getByRole("row", { name: /Highforce Agency/ })).toContainText("3.5h observed");
  await expect(page.getByText("Collecting", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Visitor locations" })).toBeVisible();
  await expect(page.locator(".world-map image")).toHaveAttribute("href", "/world-map.svg");
  await expect(page.locator(".world-map > svg")).toHaveAttribute("viewBox", "0 0 360 180");
  await expect(page.getByText("No page views recorded in the last 30 days")).toBeVisible();
  await expect(page.getByText("Counts are page views, not unique people")).toBeVisible();
  await expect(page.getByText(/sample|seeded/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Monitors", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open Portfolio Website in a new tab" })).toHaveAttribute("href", "https://davefolio.vercel.app");
  await expect(page.getByRole("button", { name: "Add a monitor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Status Page", exact: true })).toHaveCount(0);
});

test("dashboard keeps its route and map after refresh, with a working return-home control", async ({ page }) => {
  await mockPublicApi(page);
  await openDemo(page);
  await expect(page.getByRole("heading", { name: "Visitor locations" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visitor locations" })).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Explore live demo" })).toBeVisible();
});

test("visitor tracker honors the browser opt-out without contacting the collector", async ({ page }) => {
  let visits = 0;
  await page.addInitScript(() => localStorage.setItem("pulsewatch-analytics-opt-out", "true"));
  await page.route("https://d1kd92no8bklbu.cloudfront.net/api/analytics/visit", async (route) => {
    visits += 1;
    await route.fulfill({ status: 202, contentType: "application/json", body: '{"accepted":true}' });
  });
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/pulsewatch-analytics.js";
    script.dataset.pulsewatchSite = "portfolio";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Tracker script failed to load"));
    document.head.append(script);
  }));
  expect(visits).toBe(0);
});

test("visitor tracker posts without a CORS preflight", async ({ page }) => {
  const requests: { method: string; contentType: string }[] = [];
  await page.route("https://d1kd92no8bklbu.cloudfront.net/api/analytics/visit", async (route) => {
    requests.push({ method: route.request().method(), contentType: route.request().headers()["content-type"] || "" });
    await route.fulfill({ status: 202, contentType: "application/json", body: '{"accepted":true}' });
  });
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/pulsewatch-analytics.js";
    script.dataset.pulsewatchSite = "highforce";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Tracker script failed to load"));
    document.head.append(script);
  }));
  await expect.poll(() => requests).toHaveLength(1);
  expect(requests[0].method).toBe("POST");
  expect(requests[0].contentType).toMatch(/^text\/plain/);
});

test("monitor detail, incidents, and public status page navigate correctly", async ({ page }) => {
  await mockPublicApi(page);
  await page.route("**/api/status/pulsewatch-demo", (route) => json(route, {
    name: "PulseWatch Live Status",
    monitors: publicMonitors,
  }));
  await openDemo(page);
  await page.getByRole("button", { name: "Monitors", exact: true }).click();
  await page.getByRole("button", { name: "Portfolio Website" }).click();
  await expect(page.getByRole("heading", { name: "Portfolio Website" })).toBeVisible();
  await page.getByRole("tab", { name: "Response time" }).click();
  await expect(page.getByText("No response-time history recorded yet.")).toBeVisible();
  await page.getByRole("button", { name: "Back to monitors" }).click();
  await page.getByRole("button", { name: "Incidents", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No published incidents" })).toBeVisible();

  await page.goto("/status/pulsewatch-demo/");
  await expect(page.getByRole("heading", { name: "PulseWatch Live Status" })).toBeVisible();
  await expect(page.getByText("All systems operational")).toBeVisible();
});

test("visitor API error is not presented as zero visits or a deployment problem", async ({ page }) => {
  await mockPublicApi(page, "error");
  await openDemo(page);
  await expect(page.getByText("Visitor analytics is temporarily unavailable")).toBeVisible();
  await expect(page.getByText("Could not load visitor counts from AWS.")).toBeVisible();
  await expect(page.getByText("No page views recorded in the last 30 days")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Portfolio Website/ })).toBeVisible();
});

test("owner can create and edit monitors and publish a read-only status page", async ({ page }) => {
  let monitors: MockMonitor[] = [{ ...publicMonitors[0], enabled: true, intervalMinutes: 5 }];
  let statusPage: { name: string; slug: string; monitorIds: string[] } | null = null;
  await page.route("**/api/monitors", async (route) => {
    if (route.request().method() === "GET") return json(route, { monitors });
    const body = route.request().postDataJSON() as { name: string; url: string; intervalMinutes: number };
    const monitor = { monitorId: "created", ...body, status: "UNKNOWN", enabled: true };
    monitors = [...monitors, monitor];
    return json(route, { monitor }, 201);
  });
  await page.route("**/api/incidents", (route) => json(route, { incidents: [] }));
  await page.route("**/api/status-page", async (route) => {
    if (route.request().method() === "GET") return json(route, { statusPage });
    if (route.request().method() === "PUT") {
      statusPage = route.request().postDataJSON() as { name: string; slug: string; monitorIds: string[] };
      return json(route, { statusPage });
    }
    return json(route, {}, 204);
  });
  await page.route("**/api/monitors/*/checks", (route) => json(route, { checks: [] }));
  await page.route("**/api/monitors/created", async (route) => {
    if (route.request().method() === "PATCH") {
      const monitor = { ...monitors[1], ...(route.request().postDataJSON() as Partial<MockMonitor>) };
      monitors[1] = monitor;
      return json(route, { monitor });
    }
    return json(route, { monitor: monitors[1] });
  });
  await page.route("**/api/status/pulsewatch-demo", (route) => json(route, { name: statusPage?.name, monitors: [] }));

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Explore live demo" })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("pulsewatch.tokens", JSON.stringify({ accessToken: "test-access", idToken: "test-id", expiresAt: Date.now() + 60_000 })));
  await page.getByRole("button", { name: "Explore live demo" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Monitors", exact: true }).click();
  await page.getByRole("button", { name: "Add a monitor" }).click();
  await page.getByLabel("Name").fill("New monitor");
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Create monitor" }).click();
  await page.getByRole("button", { name: "New monitor" }).click();
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Updated monitor");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Updated monitor");

  await page.getByRole("button", { name: "Status Page", exact: true }).click();
  await page.getByRole("checkbox", { name: "Portfolio Website" }).check();
  await page.getByRole("button", { name: "Save public selection" }).click();
  await expect(page.getByText("Your selected real monitors are now shown in the public read-only demo.")).toBeVisible();
  await page.getByRole("button", { name: "View public page" }).click();
  await expect(page.getByRole("heading", { name: "PulseWatch live demo" })).toBeVisible();
  await expect(page.getByText("Owner account")).toHaveCount(0);
});

test("owner sign-in uses Cognito sign-in only and does not expose public registration", async ({ page }) => {
  await page.route("**/api/config", (route) => json(route, { cognitoClientId: "client-id", cognitoDomain: "auth.example.com" }));
  await page.route("https://auth.example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "mock cognito sign-in" }));
  await page.goto("/");
  await page.locator(".landing-nav").getByRole("button", { name: "Owner sign in" }).click();
  await expect(page).toHaveURL(/auth\.example\.com\/oauth2\/authorize/);
  expect(page.url()).not.toContain("signup");
  expect(page.url()).toContain("response_type=code");
});

test("dashboard remains usable on a mobile-width viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicApi(page);
  await openDemo(page);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visitor locations" })).toBeVisible();
});
