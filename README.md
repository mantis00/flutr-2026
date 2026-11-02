# Flutr

A WCAG-compliant, multi-tenant web application for butterfly houses to track shipments, quality metrics, and historical records while delivering public-facing galleries and statistics.

## Prerequisites

### Node.js >= 22.18.0

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended) or [download directly](https://nodejs.org/):

```bash
# Using nvm (reads .nvmrc automatically)
nvm install
nvm use

# Verify
node -v
```

### pnpm >= 10.29.3

```bash
# Install via corepack (bundled with Node.js)
corepack enable
corepack prepare pnpm@10.29.3 --activate

# Or install standalone
npm install -g pnpm@10.29.3

# Verify
pnpm -v
```

### Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) for your OS, then verify:

```bash
docker -v
docker compose version
```

## Getting Started

Docker Compose runs PostgreSQL and Drizzle Studio. The Next.js dev server runs locally for fast hot reload.

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env and set AUTH_SECRET (generate one with: openssl rand -base64 32)

# Start Docker services (PostgreSQL + Drizzle Studio)
docker compose up -d

# Push database schema (run once, or after schema changes)
pnpm db:push

# Start dev server
pnpm dev
```

| Service  | URL                          | Description                           |
| -------- | ---------------------------- | ------------------------------------- |
| `studio` | https://local.drizzle.studio | Drizzle Studio GUI (API on port 4983) |
| `db`     | localhost:5432               | PostgreSQL 17                         |
| dev      | http://localhost:3000        | Next.js dev server (run locally)      |

Each Docker service is independently restartable:

```bash
docker compose restart studio    # Restart Drizzle Studio
docker compose restart db        # Restart PostgreSQL

docker compose logs -f studio    # Follow logs for a specific service
docker compose up -d --build     # Rebuild after dependency changes
```

### Docker Lifecycle

```bash
docker compose down            # Stop and remove containers (volumes preserved)
docker compose down -v         # Stop, remove containers, AND delete volumes (full reset)
docker compose stop            # Stop containers without removing them
docker compose start           # Restart stopped containers
```

**After changing `package.json`**, rebuild to update the studio container's dependencies:

```bash
docker compose up -d --build studio
```

## Seeding the Database (Development Only)

One time setup: ensure Docker is running and the database is empty.
Ensure the `scripts/data/` directory contains the necessary JSON files for seeding:

- `users.json`
- `shipments.json`
- `suppliers.json`
- `institution.json`
- `institution_news.json`
- `master_butterfly_list.json`

Then run:

```bash
docker compose down -v     # Reset Docker volumes if data exists (caution: deletes all data)
docker compose up -d
pnpm db:migrate            # Apply Drizzle migration history from scratch
pnpm seed                  # Run seed script to populate initial data (Ensure .json files in scripts/data/ are present)
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Fresh Migration Reset

When a migration changes the local schema in a way that is easier to rebuild than backfill, the team should start from a clean local database instead of trying to preserve old dev data.

Current recommended reset flow:

```bash
git pull
docker compose down -v
docker compose up -d
pnpm db:migrate
pnpm seed
```

Notes:

- `docker compose down -v` removes the local Postgres volume and deletes all local DB data.
- Use `pnpm db:migrate`, not `pnpm db:push`, so everyone applies the committed Drizzle migration history in order.
- `pnpm seed` expects a fresh database and will stop if data already exists.
- This is the preferred workflow for the new baseline `0000` migration and follow-up schema migration.

## Environment Variables

| Variable           | Description                                                         | Default                                                  |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`     | PostgreSQL connection string                                        | `postgresql://postgres:postgres@localhost:5432/flutr-db` |
| `AUTH_SECRET`      | NextAuth encryption secret (`NEXTAUTH_SECRET` accepted as fallback) | _(required, generate your own)_                          |
| `AUTH_URL`         | Application base URL                                                | `http://localhost:3000`                                  |
| `WINGSPAN_API_URL` | Base URL of the Wingspan image microservice                         | `http://159.203.134.226`                                 |
| `WINGSPAN_API_KEY` | Read-only Wingspan API key, sent as the `X-API-Key` header          | _(required for butterfly images to render)_              |
| `GUIDES_PASSWORD`  | Shared read-only password for `/:institution/guides`                | `flutr2026`                                              |

Butterfly imagery is served by the Wingspan microservice, matched to Flutr species on
`scientific_name`. Without these two variables the app still runs — every species simply
renders its placeholder icon, and a warning is logged at startup of the first request.

## Commands

```bash
pnpm dev            # Start dev server
pnpm build          # Production build
pnpm start          # Start production server
pnpm lint           # ESLint check
pnpm test           # Run Jest tests
pnpm format         # Format code with Prettier
pnpm format:check   # Check code formatting
pnpm db:generate    # Generate Drizzle migrations
pnpm db:migrate     # Run database migrations
pnpm db:push        # Push schema directly to database
pnpm db:studio      # Open Drizzle Studio GUI
```

## Tech Stack

| Technology      | Purpose                             |
| --------------- | ----------------------------------- |
| Next.js 16      | Framework (App Router)              |
| TypeScript      | Language                            |
| pnpm            | Package manager                     |
| Tailwind CSS 4  | Styling                             |
| Shadcn/UI       | Accessible UI component library     |
| React Hook Form | Form management with Zod validation |
| Recharts        | Charts and statistics               |
| NextAuth 5      | Authentication (credentials, JWT)   |
| PostgreSQL 17   | Database (via Docker)               |
| Drizzle ORM     | Type-safe database queries          |
| Jest            | Testing                             |

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by [commitlint](https://commitlint.js.org/). A `commit-msg` hook validates every commit message automatically.

> **PR titles must also follow conventional commits.** All PRs are squash-merged using only the PR title as the commit message on `main`.

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `style`    | Formatting, missing semicolons, etc.                    |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or updating tests                                |
| `build`    | Changes to build system or dependencies                 |
| `ci`       | CI/CD configuration changes                             |
| `chore`    | Other changes that don't modify src or tests            |

### Examples

```bash
git commit -m "feat(shipments): add shipment creation form"
git commit -m "fix(auth): handle expired JWT refresh"
git commit -m "docs: update README prerequisites"
```

## Documentation

See [`AGENTS.md`](AGENTS.md) for full project context, conventions, and workflow rules used by both contributors and AI agents (Claude, Cursor).

Detailed docs live in `docs/`:

| Document                                  | Description                           |
| ----------------------------------------- | ------------------------------------- |
| [Architecture Overview](docs/overview.md) | App structure, auth, data model       |
| [Rules](docs/rules/)                      | Development conventions and standards |
| [Commands](docs/commands/)                | Reusable workflow templates           |
