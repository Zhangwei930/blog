# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start

# PM2 deployment
pm2 start ecosystem.config.js
```

No test suite or linter is configured.

## Architecture

Node.js/Express blog with server-side rendering via EJS templates and a SQLite database (`data/blog.db`).

**Request flow:** `src/app.js` (entry, middleware setup) → one of three routers → EJS view render

**Routers:**
- `src/routes/public.js` — public blog pages (`/`, `/article/:slug`, `/category/:slug`, `/archive`, `/about`)
- `src/routes/admin.js` — CRUD admin panel at `/admin/*`, protected by `src/middleware/auth.js` (session check)
- `src/routes/api.js` — single endpoint `POST /api/comment` with rate limiting (5/min)

**Database (`src/database.js`):** Single `better-sqlite3` instance exported as `{ db, init }`. All queries are synchronous prepared statements. `init()` creates tables, default admin (`ADMIN_USER`/`ADMIN_PASS` env vars or `magies`/`Magies@2024!`), default categories, and a sample article on first run.

**Schema:** `admins`, `categories`, `tags`, `articles`, `article_tags`, `comments`, `settings` (key/value store for blog config).

**Auth:** Session-based. `req.session.admin` is set on login; `src/middleware/auth.js` redirects to `/admin/login` if not set.

**Article content:** Stored as Markdown in `articles.content`, rendered to HTML via `marked` in the public route before passing to the template.

**File uploads:** Images uploaded via admin to `public/uploads/` using `multer` (5 MB limit, image types only).

**Environment variables:** `PORT` (default 3000), `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS`.
