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

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}

function clientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

function rateLimit(request: Request) {
  const key = clientIp(request); const now = Date.now(); const current = buckets.get(key);
  if (!current || now - current.start >= WINDOW_MS) { buckets.set(key, { start: now, count: 1 }); return true; }
  current.count += 1; return current.count <= LIMIT;
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
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname.startsWith("/v1/") || url.pathname === "/api/ai") {
      if (!rateLimit(request)) return json({ error: { message: "Rate limit exceeded" } }, 429, cors);
      if (request.method !== "POST" && url.pathname !== "/v1/models") return json({ error: { message: "Method not allowed" } }, 405, cors);
    }

    if (url.pathname === "/api/health") return json({ ok: true, service: "irenx-gateway", openai: !!env.OPENAI_API_KEY, omniroute: !!env.OMNIROUTE_BASE_URL, zero_config_client: true });
    if (url.pathname === "/v1/models") return json({ object: "list", data: [{ id: "irenx-auto", object: "model", owned_by: "irenx" }, { id: env.OPENAI_MODEL || "gpt-5.6", object: "model", owned_by: "openai" }] }, 200, cors);

    if (url.pathname === "/v1/responses" || url.pathname === "/api/ai") {
      const length = Number(request.headers.get("content-length") || 0); if (length > MAX_BODY) return json({ error: { message: "Request too large" } }, 413, cors);
      const body = await request.json().catch(() => null); if (!body) return json({ error: { message: "Invalid JSON" } }, 400, cors);
      const response = await ai(env, body, false); const headers = new Headers(response.headers); Object.entries(cors).forEach(([k,v]) => headers.set(k,v)); return new Response(response.body, { status: response.status, headers });
    }

    if (url.pathname === "/v1/chat/completions") {
      const body = await request.json().catch(() => null); if (!body) return json({ error: { message: "Invalid JSON" } }, 400, cors);
      return ai(env, body, true);
    }

    return env.ASSETS.fetch(request);
  },
};
