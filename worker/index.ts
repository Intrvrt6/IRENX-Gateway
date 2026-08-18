export { RateLimiter } from "./rate_limiter";

interface Env {
  ASSETS: Fetcher;
  RATE_LIMITER: DurableObjectNamespace;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_SEARCH_CONTEXT?: string;
  OMNIROUTE_BASE_URL?: string;
  OMNIROUTE_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITEKEY?: string;
  ENFORCE_TURNSTILE?: string;
}

const MAX_BODY = 256_000;

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}

function clientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

async function rateLimit(request: Request, env: Env) {
  const id = env.RATE_LIMITER.idFromName(clientIp(request));
  const response = await env.RATE_LIMITER.get(id).fetch("https://rate-limit/check");
  return (await response.json()) as { allowed: boolean; remaining: number; retry_after?: number };
}

async function verifyTurnstile(request: Request, env: Env) {
  if (env.ENFORCE_TURNSTILE !== "true") return true;
  if (!env.TURNSTILE_SECRET_KEY) return false;
  const token = request.headers.get("cf-turnstile-response");
  if (!token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const ip = clientIp(request);
  if (ip !== "unknown") form.append("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    if (!response.ok) return false;
    return ((await response.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

function withCors(response: Response, cors: Record<string, string>) {
  const headers = new Headers(response.headers);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

async function openai(env: Env, body: any, chatCompat = false) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const payload: Record<string, unknown> = { model: body.model || env.OPENAI_MODEL || "gpt-5.6", tools: [{ type: "web_search", search_context_size: env.OPENAI_SEARCH_CONTEXT || "medium" }] };
  if (body.input !== undefined) payload.input = body.input;
  else if (Array.isArray(body.messages)) payload.input = body.messages;
  else payload.input = body;
  if (body.instructions) payload.instructions = body.instructions;
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  if (!chatCompat) return response;
  const data: any = await response.json();
  const text = data.output_text || data.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === "output_text")?.text || "";
  return json({ id: data.id || `irenx-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: data.model || env.OPENAI_MODEL || "gpt-5.6", choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: data.usage || undefined });
}

async function omniRoute(env: Env, body: unknown) {
  if (!env.OMNIROUTE_BASE_URL) throw new Error("OmniRoute is not configured");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.OMNIROUTE_API_KEY) headers.authorization = `Bearer ${env.OMNIROUTE_API_KEY}`;
  const base = env.OMNIROUTE_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`OmniRoute ${response.status}`);
  return response;
}

async function ai(env: Env, body: any, chatCompat = false) {
  try { return await openai(env, body, chatCompat); } catch {}
  try { return await omniRoute(env, body); } catch {}
  return json({ error: { message: "No AI provider is configured or available", type: "provider_unavailable" } }, 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,cf-turnstile-response" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const protectedEndpoint = url.pathname.startsWith("/v1/") || url.pathname === "/api/ai";
    if (protectedEndpoint) {
      const limit = await rateLimit(request, env);
      if (!limit.allowed) return json({ error: { message: "Rate limit exceeded", type: "rate_limit" }, retry_after: limit.retry_after || 60 }, 429, { ...cors, "retry-after": String(limit.retry_after || 60) });
      if (request.method !== "POST" && url.pathname !== "/v1/models") return json({ error: { message: "Method not allowed" } }, 405, cors);
      if (request.method === "POST" && !(await verifyTurnstile(request, env))) return json({ error: { message: "Turnstile verification required", type: "challenge_required" } }, 403, cors);
    }

    if (url.pathname === "/api/health") return json({ ok: true, service: "irenx-gateway", openai: !!env.OPENAI_API_KEY, omniroute: !!env.OMNIROUTE_BASE_URL, zero_config_client: true, persistent_rate_limit: true, turnstile_enforced: env.ENFORCE_TURNSTILE === "true" });
    if (url.pathname === "/api/config") return json({ turnstile_sitekey: env.TURNSTILE_SITEKEY || "", turnstile_required: env.ENFORCE_TURNSTILE === "true" }, 200, cors);
    if (url.pathname === "/v1/models") return json({ object: "list", data: [{ id: "irenx-auto", object: "model", owned_by: "irenx" }, { id: env.OPENAI_MODEL || "gpt-5.6", object: "model", owned_by: "openai" }] }, 200, cors);

    if (url.pathname === "/v1/responses" || url.pathname === "/api/ai") {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > MAX_BODY) return json({ error: { message: "Request too large" } }, 413, cors);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: { message: "Invalid JSON" } }, 400, cors);
      return withCors(await ai(env, body, false), cors);
    }

    if (url.pathname === "/v1/chat/completions") {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > MAX_BODY) return json({ error: { message: "Request too large" } }, 413, cors);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: { message: "Invalid JSON" } }, 400, cors);
      return withCors(await ai(env, body, true), cors);
    }

    return env.ASSETS.fetch(request);
  },
};
