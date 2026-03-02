# create-saas-app

> Scaffold a production-ready **Multi-Tenant SaaS** Turborepo monorepo in seconds.

```bash
npx create-saas-app-cli my-project
# or
npx create-saas-app-cli         # prompts for project name
```

---

## What it generates

An opinionated but flexible Turborepo monorepo with:

| Layer               | Options                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| **Apps**            | `api` (Express) + optional `worker` (BullMQ)                                       |
| **Database**        | PostgreSQL + Drizzle · PostgreSQL + Prisma · MongoDB + Mongoose · SQLite + Drizzle |
| **Auth**            | JWT (jsonwebtoken + bcryptjs)                                                      |
| **Queue**           | BullMQ + Redis                                                                     |
| **Rate Limiting**   | None · In-memory · Redis-backed                                                    |
| **Observability**   | Prometheus + Grafana (Docker Compose)                                              |
| **CI/CD**           | Optional GitHub Actions workflow (`.github/workflows/ci.yml`)                      |
| **Package Manager** | bun · pnpm · npm                                                                   |

---

## Interactive prompts

```
◆  What is your project name?
│  my-saas-app
◆  Which package manager do you prefer?
│  ● bun  ○ pnpm  ○ npm
◆  Which database / ORM?
│  ● PostgreSQL + Drizzle ORM  ○ PostgreSQL + Prisma
│  ○ MongoDB + Mongoose  ○ SQLite + Drizzle ORM
◆  Include CI/CD workflow?  yes
◆  Include a background worker app?  yes
◆  Include observability stack?  no
◆  Include auth package?  yes
◆  Include queue package?  yes
◆  Rate limiting strategy?
│  ● None  ○ In-memory  ○ Redis-backed
◆  Initialize a git repository?  yes
```

---

## Generated structure

```
my-saas-app/
├── apps/
│   ├── api/              # Express REST API
│   └── worker/           # BullMQ background worker (optional)
├── packages/
│   ├── config/           # Shared env config
│   ├── database/         # DB client & models/schema
│   ├── logger/           # Pino structured logger
│   ├── auth/             # JWT auth helpers (optional)
│   ├── queue/            # BullMQ queues (optional)
│   ├── redis/            # ioredis client (optional)
│   ├── types/            # Shared TypeScript interfaces
│   └── typescript-config/
├── docker/
│   └── docker-compose.yml
├── turbo.json
└── package.json
```

---

## Getting started after scaffold

```bash
cd my-saas-app

# Install dependencies
bun install   # or pnpm install / npm install

# Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# Copy env file and fill in secrets
cp apps/api/.env.example apps/api/.env

# Run DB migrations (Drizzle / Prisma only)
bun run db:migrate

# Start all apps in dev mode
bun run dev
```

---

## Publishing

```bash
npm run build           # compile TypeScript
npm publish             # publish to npm registry
```

---

## License

MIT
