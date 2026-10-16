export type Monitor = {
  monitorId: string;
  name: string;
  url: string;
  status?: string;
  statusCode?: number;
  responseTimeMs?: number;
  uptime7d?: number;
  uptimeCoverageHours?: number;
  lastChecked?: string;
  enabled?: boolean;
  intervalMinutes?: number;
  uptime?: string;
  response?: string;
  checked?: string;
};

export function uptimeDisplay(monitor: Pick<Monitor, "uptime7d" | "uptimeCoverageHours">) {
  if (typeof monitor.uptime7d !== "number") {
    return { value: "—", label: "Uptime (awaiting checks)" };
  }
  const hours = monitor.uptimeCoverageHours ?? 168;
  const period = hours >= 167.5
    ? "7d"
    : hours >= 24
      ? `${(hours / 24).toFixed(hours < 48 ? 1 : 0)}d observed`
      : hours >= 1
        ? `${hours.toFixed(hours < 10 ? 1 : 0)}h observed`
        : "<1h observed";
  return {
    value: `${monitor.uptime7d.toFixed(2)}%`,
    label: hours >= 167.5 ? "Uptime (7d)" : `Uptime (${period})`,
  };
}
export type Incident = {
  incidentId?: string;
  startedAt: string;
  monitorId?: string;
  monitorName?: string;
  reason?: string;
  durationMinutes?: number;
  durationSeconds?: number;
  status: string;
};
export type CheckRecord = { timestamp:string; responseTimeMs:number; status:string; statusCode:number };

type AuthConfig = { cognitoClientId: string; cognitoDomain: string };
const TOKEN_KEY = "pulsewatch.tokens";
const FLOW_KEY = "pulsewatch.auth-flow";

type SessionTokens = { accessToken: string; idToken: string; refreshToken?: string; expiresAt?: number };

export function currentTokens(): SessionTokens | null {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; }
}

async function validAccessToken(): Promise<string | null> {
  const tokens = currentTokens();
  if (!tokens) return null;
  if (!tokens.expiresAt || tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) { sessionStorage.removeItem(TOKEN_KEY); return null; }
  const config = await authConfig();
  const response = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.cognitoClientId, refresh_token: tokens.refreshToken }),
  });
  const result: { access_token?: string; id_token?: string; expires_in?: number } = await response.json();
  if (!response.ok || !result.access_token) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error("Your session expired. Please sign in again.");
  }
  const next = { ...tokens, accessToken: result.access_token, idToken: result.id_token || tokens.idToken, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  return next.accessToken;
}

export async function api<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const token = authenticated ? await validAccessToken() : null;
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  let result: unknown = null;
  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("json")) {
      const localPreview = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
      throw new Error(localPreview
        ? "This local preview is not connected to the AWS API. Open the deployed PulseWatch site to see live monitors, or configure a local API proxy."
        : `PulseWatch API returned a non-JSON page (HTTP ${response.status}). Please try again, or contact the site owner.`);
    }
    try {
      result = await response.json();
    } catch {
      throw new Error("PulseWatch received an invalid API response. Please try again shortly.");
    }
  }
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result ? result.error : null;
    throw new Error(typeof message === "string" ? message : `Request failed (${response.status})`);
  }
  return result as T;
}

async function authConfig(): Promise<AuthConfig> {
  return api<AuthConfig>("/config");
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function beginSignIn(mode: "signin" | "signup" = "signin") {
  const config = await authConfig();
  if (!config.cognitoClientId || !config.cognitoDomain) throw new Error("Authentication is not configured yet. Deploy the AWS stack first.");
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier, state }));
  const redirect = `${location.origin}/auth/callback/`;
  const endpoint = mode === "signup" ? "signup" : "oauth2/authorize";
  const url = new URL(`https://${config.cognitoDomain}/${endpoint}`);
  url.search = new URLSearchParams({ client_id: config.cognitoClientId, response_type: "code", scope: "openid email profile", redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  location.assign(url.toString());
}

export async function completeSignIn(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null");
  if (params.has("error")) throw new Error(params.get("error_description") || params.get("error") || "Sign in failed");
  if (!code || !flow || params.get("state") !== flow.state) throw new Error("Sign-in response could not be verified. Please try again.");
  const config = await authConfig();
  const response = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.cognitoClientId, code, redirect_uri: `${location.origin}/auth/callback/`, code_verifier: flow.verifier }),
  });
  const result: { access_token: string; id_token: string; refresh_token?: string; expires_in?: number; error_description?: string } = await response.json();
  if (!response.ok) throw new Error(result.error_description || "Could not exchange the sign-in code");
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: result.access_token, idToken: result.id_token, refreshToken: result.refresh_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 }));
  sessionStorage.removeItem(FLOW_KEY);
  history.replaceState({}, "", "/");
}

export async function signOut() {
  const config = await authConfig();
  sessionStorage.removeItem(TOKEN_KEY);
  location.assign(`https://${config.cognitoDomain}/logout?${new URLSearchParams({ client_id: config.cognitoClientId, logout_uri: location.origin })}`);
}
