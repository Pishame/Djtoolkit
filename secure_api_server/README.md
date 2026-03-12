# DJ Toolkit Secure API Server

Middle-layer API server for desktop/web clients. Secrets stay on this server.

## Features (Phase B scaffold)
- `POST /api/auth/signin`
- `POST /api/auth/signup`
- `POST /api/auth/google/start`
- `GET /api/spotify/token`
- `GET /api/spotify/search`
- `GET /api/spotify/lookup`
- `POST /api/billing/create-checkout-session`
- `GET /health`

## Setup
1. Copy `.env.example` to `.env`.
2. Fill your secrets and URLs.
3. Install deps and run:
   - `npm install`
   - `npm run dev`

## Deploy (Render, always-on)
1. Push this repo to GitHub.
2. In Render, create a new `Blueprint` and point to the repo.
3. Render will detect [`render.yaml`](./render.yaml) and create `dj-toolkit-secure-api`.
4. In Render dashboard, fill environment variables:
   - `ALLOWED_ORIGINS`:
     - For desktop app only: can be left blank, requests without origin are allowed.
     - For browser app too: add your frontend domain(s), comma-separated.
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `STRIPE_SECRET_KEY` (optional until billing goes live)
   - `STRIPE_SUCCESS_URL`
   - `STRIPE_CANCEL_URL`
5. Wait for deploy success and copy the public URL, e.g. `https://dj-toolkit-secure-api.onrender.com`.
6. Update frontend env in `AIstudio_new_ui/.env.local`:
   - `VITE_API_BASE_URL=https://<your-render-url>`
   - Keep:
     - `VITE_ENABLE_SERVER_AUTH=1`
     - `VITE_ENABLE_SERVER_SPOTIFY=1`
     - `VITE_ENABLE_SERVER_BILLING=1`
7. Rebuild frontend:
   - `cd AIstudio_new_ui`
   - `npm run build`

## Security notes
- Do not expose `SPOTIFY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, or service-role keys to frontend.
- Lock CORS using `ALLOWED_ORIGINS`.
- Put this behind HTTPS in production.
- Add upstream auth/session verification before production billing.
- Rotate any secrets that were previously shared in plain text.

## Frontend wiring
Set these in `AIstudio_new_ui/.env.local`:
- `VITE_API_BASE_URL=http://localhost:8787`
- `VITE_ENABLE_SERVER_AUTH=1`
- `VITE_ENABLE_SERVER_SPOTIFY=1`
- `VITE_ENABLE_SERVER_BILLING=1`
