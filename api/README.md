# LegalBridge API — FastAPI backend (Phase 1)

This is the **Python/FastAPI** side of LegalBridge. It runs alongside the
existing Supabase Edge Functions (`chat-stream`, `chat-tools`,
`chat-documents`) and will eventually live at **`api.legalbridge.ng`**.

Phase 1 scope (this commit) is intentionally minimal:

- FastAPI app skeleton with CORS for `legalbridge.ng`
- Supabase JWT verification middleware (PyJWT, HS256) — the same tokens
  Supabase Auth issues to the browser are validated here, so users are
  authenticated seamlessly across both backends
- Async PostgreSQL connection (SQLAlchemy 2.0 + asyncpg) pointed at the
  existing Supabase database
- `/health` and `/health/live` endpoints
- Dockerfile + `railway.toml` for one-click Railway deploys

No Edge Functions are migrated yet. No frontend changes.

---

## Project layout

```
api/
├── app/
│   ├── __init__.py
│   ├── main.py          ← FastAPI app + CORS + lifespan
│   ├── config.py        ← env-driven settings (pydantic-settings)
│   ├── auth.py          ← Supabase JWT verification (PyJWT)
│   ├── database.py      ← async engine, get_db dependency
│   └── routes/
│       ├── __init__.py
│       └── health.py    ← /health, /health/live
├── Dockerfile
├── railway.toml
├── requirements.txt
├── .dockerignore
├── .env.example
└── README.md            ← this file
```

---

## Local development

```bash
cd api
python -m venv .venv
source .venv/bin/activate          # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
# Fill .env with real Supabase values
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then open:

- `http://127.0.0.1:8000/`            → root JSON
- `http://127.0.0.1:8000/health`      → DB-backed readiness probe
- `http://127.0.0.1:8000/health/live` → cheap liveness probe
- `http://127.0.0.1:8000/docs`        → Swagger UI

---

## Authenticating against the API

The frontend already gets a JWT from Supabase Auth (`supabase.auth.getSession`).
Forward it to this API exactly as the Edge Functions already do:

```javascript
const { data: { session } } = await sb.auth.getSession();
fetch("https://api.legalbridge.ng/some-endpoint", {
  headers: {
    "Authorization": `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  },
});
```

Inside a FastAPI route, depend on `require_user`:

```python
from fastapi import APIRouter, Depends
from app.auth import AuthenticatedUser, require_user

router = APIRouter()

@router.get("/me")
async def me(user: AuthenticatedUser = Depends(require_user)):
    return {"id": user.id, "email": user.email, "role": user.role}
```

For routes that should accept anonymous traffic, swap to `optional_user`.

---

## Deploying to Railway

1. Create a new **Service** in the LegalBridge Railway project.
2. Connect this GitHub repo and set the service **Root Directory** to `/api`.
3. Railway will auto-detect the Dockerfile.
4. Under **Settings → Variables**, paste every key from `.env.example`,
   filling in real values from your Supabase project:
   - `SUPABASE_URL`
   - `SUPABASE_JWT_SECRET` (Settings → API → JWT Secret)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `DATABASE_URL` (Settings → Database → Connection string → URI; use
     the **Transaction pooler** on port 6543 for production)
   - `CORS_ALLOWED_ORIGINS` defaults to `legalbridge.ng` + `www.legalbridge.ng`
5. Under **Settings → Networking → Public Networking**, add the custom
   domain `api.legalbridge.ng` and point its DNS at the Railway target.
6. Once the deploy is green, hit `https://api.legalbridge.ng/health` —
   you should see `{"status":"ok","checks":{"database":"ok"}, ...}`.

---

## What's NOT in Phase 1

- No Edge Function logic has been ported here.
- The frontend (`chat.html`) has not been modified — it still talks to
  `chat-stream`, `chat-tools`, and `chat-documents` on Supabase.
- No new database tables, no migrations. Schema remains owned by the
  Supabase / Edge Function side.

These come in later phases.
