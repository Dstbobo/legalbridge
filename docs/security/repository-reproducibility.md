# Repository reproducibility boundary

Last reviewed: 2026-08-24

The canonical deployable backend is represented by:

- 17 ordered SQL migrations under `supabase/migrations/`;
- 11 Edge Function entry points under `supabase/functions/`;
- shared authorization, quota, fallback and Live-ticket modules under
  `supabase/functions/_shared/`;
- Edge Function JWT settings in `supabase/config.toml`;
- the Railway/FastAPI source and pinned dependencies under `api/`.

`source/` is a preserved historical recovery area, not deployment input. The
old anonymous `chat-search` and `chat-vision` snapshots are superseded by the
authenticated `chat-tools` implementation.

The following local entries are intentionally excluded from preservation and
security commits:

- `supabase/.temp/cli-latest` — Supabase CLI runtime state;
- root `CLAUDE.md` — untracked local agent notes;
- `playstore-screenshots/` — unrelated generated review/media artifacts;
- ignored virtual environments, dependency directories, caches, `.env*`, APKs,
  AABs, keystores and signing files.

A fresh ephemeral Supabase replay in Security CI is the required evidence that
the tracked migration sequence and pgTAP suite remain reproducible. No
production database is used for that validation.
