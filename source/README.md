# Historical recovery snapshots

This directory contains preserved, non-authoritative recovery snapshots from
earlier Edge Function iterations. It is not a deployment source directory.

The only deployable Supabase source is under `supabase/functions/`, with its
JWT settings in `supabase/config.toml` and database state in
`supabase/migrations/`. In particular, the old `chat-search` and `chat-vision`
snapshots here are superseded by the authenticated `chat-tools` function and
must not be deployed.

These files remain tracked only to preserve the pre-remediation engineering
record. Security review and CI apply to them for secret detection, but no
runtime should import or deploy them.
