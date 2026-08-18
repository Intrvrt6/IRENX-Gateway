interface Env {
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_SEARCH_CONTEXT?: string;
  OMNIROUTE_BASE_URL?: string;
  OMNIROUTE_API_KEY?: string;
}

const buckets = new Map<string, { start: number; count: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 30;
const MAX_BODY = 256_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function clientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin || /https?:\/\/localhost(?::\d+)?$/.test(origin);
}

function rateLimit(request: Request) {
  const key = clientIp(request);
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.start >= WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= LIMIT;
}

async function openai(request: Request, env: Env, body: unknown) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const input = typeof body === "object" && body !== null && "input" in body ? body : { input: body };
  const payload = { ...input as Record<string, unknown>, model: (body as any)?.model || env.OPENAI_MODEL || "gpt-5.6", tools: [{ type: "web_search", search_context_size: env.OPENAI_SEARCH_CONTEXT || "medium" }] };
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function omniRoute(request: Request, env: Env, body: unknown) {
  if (!env.OMNIROUTE_BASE_URL) throw new Error("OmniRoute is not configured");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.OMNIROUTE_API_KEY) headers.authorization = `Bearer ${env.OMNIROUTE_API_KEY}`;
  const base = env.OMNIROUTE_BASE_URL.replace(/\/$/, "");
  return fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function ai(request: Request, env: Env, body: unknown) {
  try {
    const response = await openai(request, env, body);
    if (response.ok) return response;
  } catch {}
  try {
    return await omniRoute(request, env, body);
  } catch {
    return json({ error: { message: "No AI provider is configured or available", type: "provider_unavailable" } }, 503);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization" } });

    if (url.pathname.startsWith("/v1/") || url.pathname === "/api/ai") {
      if (!allowedOrigin(request)) return json({ error: { message: "Origin not allowed" } }, 403);
      if (!rateLimit(request)) return json({ error: { message: "Rate limit exceeded" } }, 429);
      if (request.method !== "POST" && url.pathname !== "/v1/models") return json({ error: { message: "Method not allowed" } }, 405);
    }

    if (url.pathname === "/api/health") return json({ ok: true, service: "irenx-gateway", openai: !!env.OPENAI_API_KEY, omniroute: !!env.OMNIROUTE_BASE_URL, zero_config_client: true });
    if (url.pathname === "/v1/models" && request.method === "GET") return json({ object: "list", data: [{ id: "irenx-auto", object: "model", owned_by: "irenx" }, { id: env.OPENAI_MODEL || "gpt-5.6", object: "model", owned_by: "openai" }] });

    if (url.pathname === "/v1/responses" || url.pathname === "/api/ai") {
      if (request.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);
      const length = Number(request.headers.get("content-length") || 0);
      if (length > MAX_BODY) return json({ error: { message: "Request too large" } }, 413);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: { message: "Invalid JSON" } }, 400);
      return ai(request, env, body);
    }

    if (url.pathname === "/v1/chat/completions") {
      if (request.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: { message: "Invalid JSON" } }, 400);
      return ai(request, env, body);
    }

    return env.ASSETS.fetch(request);
  },
};
