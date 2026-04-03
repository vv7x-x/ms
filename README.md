Crystal Feather — Development README

Quick start

1. Install dependencies

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill values

3. Run in development

```bash
npm run dev
```

Notes
- The project uses Supabase for database/storage. Set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`.
- Configure `JWT_SECRET` and `SESSION_SECRET` before running in production.
- `CORS_ALLOWED` can be a comma-separated list of allowed origins.

Goals of Milestone A
- Fix JWT secret usage, enable basic rate-limiting, restrict CORS, and validate uploaded files.
