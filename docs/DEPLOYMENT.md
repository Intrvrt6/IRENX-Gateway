# Production deployment

## Cloudflare

1. Create/deploy the Worker `irenx-gateway`.
2. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Add Worker secrets:
   - `OPENAI_API_KEY`
   - `OMNIROUTE_API_KEY` (optional)
   - `TURNSTILE_SECRET_KEY` when Turnstile enforcement is enabled
4. Configure Worker variables:
   - `OMNIROUTE_BASE_URL` (optional)
   - `TURNSTILE_SITEKEY`
   - `ENFORCE_TURNSTILE=true` for public anonymous POST protection
5. Attach the custom domain you want, for example `gateway.irenx.com`.

The browser never receives provider credentials. The public UI is zero-config for the user. Do not publish provider keys in GitHub Actions variables, source files, or frontend code.

## OpenAI-compatible clients

Base URL: `https://gateway.irenx.com/v1`

Use `irenx-auto` as the model. Provider credentials remain server-side.

## Rate limiting

The gateway uses a SQLite-backed Cloudflare Durable Object named `RateLimiter`, currently configured for 30 requests/minute per client IP. This replaces the previous isolate-local in-memory throttle.

## Turnstile

Turnstile is opt-in through `ENFORCE_TURNSTILE=true`. The Worker validates every protected POST token against Cloudflare Siteverify. The Android/web UI automatically renders the widget when the sitekey is configured.

## WAF

Configure Cloudflare WAF on the production zone/hostname as an edge layer. Recommended protections include bot challenges, request-rate controls for `/v1/*` and `/api/ai`, malformed-request blocking, and abuse rules for repeated `403`/`429` behavior. See `docs/CLOUDFLARE_SECURITY.md`.

## Production checklist

- [ ] `OPENAI_API_KEY` configured as a Worker secret
- [ ] Durable Object migration deployed successfully
- [ ] `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITEKEY` configured
- [ ] `ENFORCE_TURNSTILE=true` for anonymous public POST traffic
- [ ] WAF rules enabled on the production hostname
- [ ] Custom domain active
- [ ] `/api/health` returns expected provider/security state
