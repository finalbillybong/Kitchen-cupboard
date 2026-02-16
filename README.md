# Kitchen Cupboard

A collaborative shopping list web app built for self-hosting on Docker/Unraid.

## Features

- **Multiple lists** — create and manage separate shopping lists
- **Real-time collaboration** — multiple people can edit the same list simultaneously via WebSocket
- **Smart categories** — items auto-categorize based on history (13 default categories + custom)
- **Item memory** — remembers category assignments so you don't have to re-categorize every time
- **Item suggestions** — autocomplete from previously added items
- **Sharing** — share lists with other users as editor or viewer
- **Dark mode** — automatic or manual toggle
- **REST API** — documented API with Bearer token auth for AI agents and integrations
- **API keys** — create scoped keys for external tools
- **PWA support** — installable on mobile devices
- **Invite system** — control registration with invite codes
- **Admin panel** — manage users and invite codes

## Quick Start (Docker Compose)

1. Clone the repository:
   ```bash
   git clone https://github.com/finalbillybong/Kitchen-cupboard.git
   cd Kitchen-cupboard
   ```

2. Generate a secret key:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

3. Edit `docker-compose.yml` and set your `SECRET_KEY`.

4. Start the app:
   ```bash
   docker compose up -d
   ```

5. Open `http://your-server:8111` in your browser.

6. The **first user to register** automatically becomes admin.

## Unraid Setup

1. Copy `docker-compose.yml` to your Unraid server or use the Docker template.
2. Map the `/app/data` volume to a persistent location (e.g., `/mnt/user/appdata/kitchen-cupboard`).
3. Set environment variables:
   - `SECRET_KEY`: A long random string (required for security)
   - `REGISTRATION_ENABLED`: Set to `false` to require invite codes

## Cloudflare Tunnel

Since this app uses JWT-based authentication with bcrypt password hashing, it's safe to expose via Cloudflare Tunnel. Recommended setup:

1. Create a Cloudflare Tunnel pointing to `http://localhost:8111`
2. Set `REGISTRATION_ENABLED=false` in your environment
3. Create the first admin account, then generate invite codes for other users

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `change-me-in-production` | JWT signing key — **must change** |
| `REGISTRATION_ENABLED` | `true` | Set `false` to require invite codes |
| `DATABASE_URL` | `sqlite:///./data/kitchen_cupboard.db` | Database connection string |

## API Documentation

- **Interactive docs**: `http://your-server:8111/api/docs`
- **Full reference**: See [API.md](API.md)
- **AI context endpoint**: `GET /api/context` — returns a structured summary of all capabilities

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 18, Vite, Tailwind CSS
- **Auth**: JWT + bcrypt, API keys
- **Real-time**: WebSocket
- **Container**: Docker (single container, multi-stage build)
