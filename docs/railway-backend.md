# Railway Backend Deploy Guide

This guide deploys the FastAPI backend from `backend/` to Railway.

## 1) Prerequisites

- Railway account + project access
- Railway CLI installed and logged in:

```bash
railway login
```

## 2) Create/link the Railway service

```bash
cd /path/to/Schemata
railway init -n schemata
railway add --service schemata-api
railway link --service schemata-api
```

## 3) Set environment variables

Required:
- `OPENAI_API_KEY` (or whichever AI provider key the backend uses)

Recommended:
- `OPENAI_MODEL=gpt-5.4-mini`
- `ENVIRONMENT=production`
- `WEB_CONCURRENCY=2`
- `CORS_ORIGINS=https://<your-vercel-domain>`

Optional:
- `GITHUB_PAT` — higher GitHub API rate limits
- `GITHUB_CLIENT_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID` — GitHub App auth
- `API_ANALYTICS_KEY`

```bash
railway variables --service schemata-api --set "OPENAI_API_KEY=..."
railway variables --service schemata-api --set "ENVIRONMENT=production"
railway variables --service schemata-api --set "WEB_CONCURRENCY=2"
railway variables --service schemata-api --set "CORS_ORIGINS=https://<your-vercel-domain>"
```

## 4) Deploy

```bash
railway up --service schemata-api --path-as-root backend
```

## 5) Create a public domain

```bash
railway domain --service schemata-api
```

## 6) Point Vercel frontend to Railway backend

In your Vercel project environment variables:

- `NEXT_PUBLIC_USE_LEGACY_BACKEND=true`
- `NEXT_PUBLIC_API_DEV_URL=https://<your-railway-domain>`

Then redeploy.

## 7) Verify

1. Health check: `GET https://<your-railway-domain>/healthz` → `{"ok": true, "status": "ok"}`
2. Generate a diagram from the frontend.
3. Check logs: `railway logs --service schemata-api`
