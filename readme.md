# Interview Practice Partner SaaS

This project is now split into a real `frontend` and `backend` architecture with:

- browser UI preserved for landing, chat interview, and voice interview flows
- Express backend for Gemini orchestration, logging, validation, rate limiting, and error handling
- Supabase Auth plus Postgres persistence for users, sessions, messages, feedback, and analytics
- analytics endpoints and a protected dashboard page

## Structure

```text
frontend/
  auth.html
  dashboard.html
  index.html
  chat.html
  voice.html
  css/
  js/

backend/
  src/
    config/
    constants/
    middleware/
    models/
    routes/
    services/
    utils/
    validators/

supabase/
  migrations/
```

## What Changed

- Gemini calls no longer happen in the browser.
- The Gemini API key now lives only on the backend.
- Supabase stores profile data, interview sessions, transcript messages, feedback, and score summaries.
- Users sign in with Supabase Auth before using the product.
- The server now includes:
  - request logging
  - auth middleware
  - payload validation with `zod`
  - global and AI-specific rate limits
  - centralized error handling
  - analytics endpoints for dashboard views

## Environment

Create `backend/.env` from `backend/.env.example` and fill in:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `FRONTEND_URL`
- model overrides
- rate limit overrides

Create `frontend/.env` from `frontend/.env.example` only if you want to override the local backend URL during development.

## Supabase Setup

1. Create a Supabase project on the free tier.
2. Enable Email auth in Supabase Auth.
3. Run the SQL migration in `supabase/migrations/20260424_init_interview_saas.sql`.
4. Copy the project URL, anon key, and service role key into `backend/.env`.

## Run Locally

From the repo root:

```bash
npm install
npm run dev
```

This starts:

- backend on `http://localhost:4000`
- frontend on `http://localhost:5173`

## Build

```bash
npm run build
```

The frontend builds with Vite. The backend is runtime-only and starts directly with Node.

## API Overview

Public:

- `GET /api/public/health`
- `GET /api/public/bootstrap`

Authenticated interview APIs:

- `POST /api/interviews`
- `POST /api/interviews/:sessionId/respond`
- `POST /api/interviews/:sessionId/messages`
- `POST /api/interviews/:sessionId/complete`
- `POST /api/interviews/:sessionId/feedback`

Authenticated analytics APIs:

- `GET /api/analytics/overview`
- `GET /api/analytics/timeline`
- `GET /api/analytics/jobs`
- `GET /api/analytics/recent-sessions`

## Notes

- The existing interview UI and core conversational flow were kept intentionally close to the original app.
- Voice mode still uses browser speech recognition and speech synthesis on the client, but all AI generation and persistence now go through the backend.
- Supabase free tier is enough for this setup as long as request volume stays moderate and logs are handled at the app/server layer instead of storing every request in the database.
