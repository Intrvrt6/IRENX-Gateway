# IRENX Gateway

Open-source, zero-config AI gateway for Android, web clients, and OpenAI-compatible applications.

## What it does

IRENX Gateway provides a single server-side endpoint that can route AI requests to configured providers without exposing provider API keys to the client.

### Core architecture

```text
Android / Web / OpenAI-compatible client
                  |
                  v
          IRENX Gateway
                  |
        +---------+---------+
        |                   |
        v                   v
   OpenAI Responses      OmniRoute
      + web search        fallback
        |
        v
     IRENX PRIME
```

## Zero-config client

The client does **not** need an OpenAI API key. Provider credentials belong only in the server environment (Cloudflare Worker secrets or equivalent deployment secrets).

> Zero-config for clients does not mean unauthenticated public infrastructure. Production deployments should add access controls, rate limiting, WAF/Turnstile, or another abuse-prevention layer before exposing a provider-backed gateway publicly.

## Endpoints

- `GET /` — mobile/PWA dashboard
- `GET /api/health` — gateway/provider health
- `POST /api/ai` — IRENX AI request
- `POST /v1/responses` — OpenAI-compatible Responses proxy
- `POST /v1/chat/completions` — OpenAI-compatible Chat Completions proxy
- `GET /v1/models` — gateway model catalog

## Providers

OpenAI Responses API is primary when `OPENAI_API_KEY` is configured. OmniRoute can be used as fallback through `OMNIROUTE_BASE_URL` and `OMNIROUTE_API_KEY`. No provider key is exposed to the browser.

## Environment variables

See `.env.example`. Never commit real credentials.

## Cloudflare

The intended production runtime is Cloudflare Workers with static assets. Configure Worker secrets in Cloudflare rather than storing them in Git.

## Security

- Never put API keys in frontend JavaScript.
- Never commit `.env` files containing secrets.
- Use Cloudflare WAF/Turnstile or equivalent protection for public deployments.
- Keep provider keys scoped to the minimum required permissions.
- Rotate leaked credentials immediately.
- Do not bypass provider authentication or usage restrictions.

See `SECURITY.md` for vulnerability reporting guidance.

## Development

```bash
npm install
npm run typecheck
npx wrangler deploy --dry-run
```

## License

Apache-2.0. See `LICENSE`.

## Disclaimer

IRENX Gateway is infrastructure software. AI output can be inaccurate. Trading-related output is informational and is not financial advice or a guarantee of execution, profitability, or performance.
