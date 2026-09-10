# JARVIS AI Assistant

JARVIS is a React + Vite frontend backed by an Express `jarvis-server`. The
backend authenticates Supabase sessions, forwards assistant requests to n8n,
and handles server-side Gmail access. n8n is deployed separately and hosts the
JARVIS workflow and its provider integrations.

## Architecture

```text
Browser (Vercel)
  -> jarvis-server (Render)
    -> Supabase Auth / Postgres
    -> n8n workflow
    -> Google Gmail APIs
```

The browser receives only frontend-safe configuration. n8n keys, Google client
secrets, the Supabase service-role key, and the Gmail encryption key stay on the
backend.

## Local Development

Install frontend dependencies and create a local `.env` from `.env.example`:

```bash
npm install
npm run dev
```

Run the backend separately:

```bash
cd jarvis-server
npm install
npm start
```

For local development, the backend uses `http://localhost:5173` for CORS and
`http://localhost:5678` for n8n when `FRONTEND_URL` and `N8N_BASE_URL` are not
set. The backend still requires `N8N_API_KEY` and the other server-side
credentials needed by the enabled features.

## Environment Variables

Copy the variable names from `.env.example` and `jarvis-server/.env.example`.
Set frontend variables in Vercel and backend variables in Render. Never put
backend-only secrets in a `VITE_*` variable or the frontend `.env` file.

Frontend variables:

- `VITE_JARVIS_SERVER_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Backend variables:

- `PORT`
- `FRONTEND_URL`
- `N8N_BASE_URL`
- `N8N_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GMAIL_TOKEN_ENCRYPTION_KEY`

## Vercel Deployment

Create a Vercel project using the repository root. Configure the three
`VITE_*` variables for the deployed Render backend and Supabase project, then
use the existing Vite build command:

```bash
npm run build
```

Do not add server secrets to Vercel environment variables.

## Render Deployment

Create a Render web service using `jarvis-server` as the service root. Use:

- Build command: `npm install`
- Start command: `npm start`

Set the backend variables from `jarvis-server/.env.example`. Set `FRONTEND_URL`
to the exact deployed Vercel origin and set `NODE_ENV=production`. Render
supplies `PORT`; the server listens on it automatically.

## n8n Dependency

Deploy the existing n8n workflow separately and set `N8N_BASE_URL` and
`N8N_API_KEY` on the backend. The JARVIS server cannot complete chat requests
until the n8n webhook and execution API are reachable from Render.

## Security Notes

- `.env` files are ignored and must never be committed.
- `.env.example` files contain names and placeholders only.
- Supabase publishable configuration may be used by the frontend; the
  service-role key must remain server-side.
- Google OAuth secrets, n8n API keys, and Gmail encryption keys are server-only.
- CORS allows one configured frontend origin and does not use `*`.
