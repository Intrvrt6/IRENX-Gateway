# Cloudflare public-gateway security

IRENX Gateway now has two application-level defenses:

1. **SQLite Durable Object rate limiting** — 30 requests/minute per client IP, shared through a Durable Object instead of Worker isolate memory.
2. **Turnstile** — optional server-validated bot protection for POST AI endpoints.

Cloudflare Turnstile tokens must be validated server-side with the Siteverify API; client-side widgets alone are not sufficient. Tokens are single-use and expire after five minutes.

## Turnstile setup

Create a Turnstile widget in Cloudflare and configure:

- Worker secret: `TURNSTILE_SECRET_KEY`
- Worker variable: `TURNSTILE_SITEKEY`
- Worker variable: `ENFORCE_TURNSTILE=true`

The Android/web UI obtains the sitekey from `/api/config` and sends the resulting token in `cf-turnstile-response`.

## WAF recommendation

WAF configuration is account/zone state and is intentionally not stored in application source. For the public hostname, add a Cloudflare WAF custom rule that challenges or blocks obvious abusive traffic, for example:

- high request rate to `/v1/*` and `/api/ai`
- malformed or oversized requests
- known automated/bot traffic
- repeated `403`/`429` patterns

Keep `/api/health` available for monitoring and keep static assets cacheable.

## Important

WAF and Durable Object rate limiting solve different problems. Use both. WAF operates at the edge; the Durable Object provides a consistent per-key application quota.
