# Credential consumer map

Last reviewed: 2026-08-24. This inventory intentionally contains names and
consumer locations only; it contains no credential values.

## Supabase Edge Functions

| Credential / setting | Server-side consumers | Intended store |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Verified-principal lookup in private Edge Functions | Supabase function environment |
| `SUPABASE_SERVICE_ROLE_KEY` | Database writes, provider quotas and privileged server workflows | Supabase function secret only |
| `ANTHROPIC_API_KEY` | Chat, documents, tools, news summary, engine check | Supabase function secret only |
| `GEMINI_API_KEY` | Chat fallback, tools, Live, news summary, engine check | Supabase function secret only |
| `GROQ_API_KEY` | Chat/tools/news fallback and engine check | Supabase function secret only |
| `VOYAGE_API_KEY` | Legal retrieval in tools | Supabase function secret only |
| `RESEND_API_KEY` | Welcome and privileged broadcast functions | Supabase function secret only |
| `LIVE_TICKET_SECRET` | Short-lived Live ticket issue/verification | Supabase function secret only |
| `NEWS_INGEST_SECRET` | Internal news ingestion and secure cron request | Supabase function secret plus Supabase Vault for cron |

## Railway API

| Credential / setting | Consumer | Intended store |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | API auth/database integration | Railway service variables |
| `SUPABASE_JWT_SECRET` | API JWT verification | Railway secret variable |
| `SUPABASE_SERVICE_ROLE_KEY` | Atomic quota RPC only | Railway secret variable |
| `DATABASE_URL` | SQLAlchemy PostgreSQL connection | Railway secret variable |
| `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` | Document generation and retrieval | Railway secret variables |

## Mobile / EAS / local development

Only public configuration may use the `EXPO_PUBLIC_` prefix:
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GEMINI_LIVE_URL`,
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The Supabase
anonymous key is a public client identifier constrained by RLS; it is never an
authorization substitute. Provider keys, service-role credentials, signing
material and JWT secrets are prohibited from mobile builds.

Local `mobile/.env*` files are ignored. Equivalent public values for hosted
builds belong in the EAS environment, not the repository.

## GitHub Actions / release signing

The existing release build consumes `KEYSTORE_BASE64` and
`KEYSTORE_PASSWORD` from GitHub Actions secrets on `main`. The workflow that
generated and exported private signing material as an artifact is removed by
the security branch. No signing material is used by Security CI.

## Rotation prerequisites (not executed)

Before any rotation, verify the corresponding value in Supabase function
secrets, Railway variables, GitHub Actions/EAS settings, authorized local
environments and any old clones. Update consumers in a staging-safe order,
validate health/auth/quota behavior, then revoke the replaced value. Production
rotation requires separate approval.
