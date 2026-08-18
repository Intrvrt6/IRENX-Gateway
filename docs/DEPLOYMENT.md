# Production deployment

## Cloudflare

1. Create a Worker named `irenx-gateway` or let Wrangler create it.
2. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Add Worker secrets:
   - `OPENAI_API_KEY`
   - `OMNIROUTE_API_KEY` (optional)
4. Configure `OMNIROUTE_BASE_URL` if OmniRoute is available.
5. Attach the custom domain you want, for example `gateway.irenx.com`.

The browser never receives provider credentials. The public UI is zero-config for the user. Do not publish provider keys in GitHub Actions variables, source files, or frontend code.

## OpenAI-compatible clients

Base URL: `https://gateway.irenx.com/v1`

Use `irenx-auto` as the model. For the browser UI no API key is required; server-side provider credentials are used by the Worker.

## Important

A public zero-key API endpoint is abuse-prone. Keep Cloudflare WAF/rate limiting enabled and use Turnstile or authenticated sessions for higher-volume public access. The built-in Worker throttle is only a first layer because isolate-local memory is not a global rate limiter.
