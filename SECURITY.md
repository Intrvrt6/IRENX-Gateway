# Security Policy

## Supported versions

The `main` branch is the actively maintained version.

## Reporting a vulnerability

Please do not publish secrets, credentials, authentication bypasses, or working exploit details in a public issue.

Use a private GitHub security advisory or another private maintainer channel available on the repository. Include enough information to reproduce and assess the issue safely.

## Credential safety

Never commit:

- `OPENAI_API_KEY`
- `OMNIROUTE_API_KEY`
- Cloudflare API tokens
- account credentials
- session signing secrets

If a credential is exposed, revoke and rotate it immediately.

## Public deployment warning

IRENX Gateway is designed to keep provider credentials server-side. A public deployment should use rate limiting, WAF/Turnstile, authentication/session controls, logging, and quota protection appropriate to its threat model.
