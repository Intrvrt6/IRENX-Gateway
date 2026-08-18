# IRENX Gateway

Zero-config, OpenAI-compatible AI gateway for IRENX. Users can access the web app from Android without entering provider API keys. Provider credentials stay server-side in Cloudflare Worker secrets.

## Endpoints

- `GET /` — mobile/PWA dashboard
- `GET /api/health` — gateway/provider health
- `POST /api/ai` — IRENX AI request
- `POST /v1/responses` — OpenAI-compatible Responses proxy
- `POST /v1/chat/completions` — OpenAI-compatible Chat Completions proxy
- `GET /v1/models` — gateway model catalog

## Providers

OpenAI Responses API is primary when `OPENAI_API_KEY` is configured. OmniRoute can be used as fallback through `OMNIROUTE_BASE_URL` and `OMNIROUTE_API_KEY`. No provider key is exposed to the browser.

## Cloudflare secrets

Set these as Worker secrets, never in Git:

- `OPENAI_API_KEY`
- `OMNIROUTE_API_KEY` (optional)
- `GATEWAY_SESSION_SECRET` (optional; reserved for signed session auth)

Optional variables:

- `OPENAI_MODEL` (default `gpt-5.6`)
- `OPENAI_SEARCH_CONTEXT` (default `medium`)
- `OMNIROUTE_BASE_URL`

## Security model

This is zero-config for the client, not unauthenticated infrastructure. The gateway applies request-size limits, per-IP in-memory throttling, origin checks for browser calls, and provider-side secrets. For a public production endpoint, add Cloudflare WAF/Turnstile and/or Durable Objects rate limiting before removing the browser origin restriction.
