# ────────────────────────────────────────────────────────────────────
# LegalBridge FastAPI — production image for Railway
#
# Build context: /api (the railway service's root must be set to /api)
# ────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

# Run as non-root for safety
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps that asyncpg needs at runtime are statically linked into the
# wheel, but we still need build-essential when wheels are missing.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /api

# Install Python deps first — leverages Docker layer cache
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the application code
COPY app ./app

# Create a non-root user
RUN useradd --create-home --shell /bin/bash appuser && chown -R appuser:appuser /api
USER appuser

# Railway sets $PORT at runtime. Default to 8000 for local docker runs.
ENV PORT=8000
EXPOSE 8000

# Healthcheck — uses the lightweight liveness endpoint so a slow DB
# doesn't make the container appear dead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:${PORT}/health/live || exit 1

# Single uvicorn worker — Railway-friendly. Scale via Railway replicas
# rather than --workers so each instance is independently observable.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --log-level ${LOG_LEVEL:-info}"]
