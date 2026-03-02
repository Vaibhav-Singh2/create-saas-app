import type {
  ProjectAnswers,
  DatabaseChoice,
  RateLimitChoice,
} from "./prompts.js";

// ─── Root package.json ────────────────────────────────────────────────────────

export function rootPackageJson(a: ProjectAnswers): string {
  const pkgManager = a.packageManager;
  const pmVersions: Record<string, string> = {
    bun: "bun@1.3.8",
    pnpm: "pnpm@9.0.0",
    npm: "npm@10.0.0",
  };

  return JSON.stringify(
    {
      name: a.projectName,
      private: true,
      scripts: {
        build: "turbo run build",
        dev: "turbo run dev",
        lint: "turbo run lint",
        "check-types": "turbo run check-types",
        test: "turbo run test",
        "db:generate": "turbo run db:generate --filter=@saas/database",
        "db:migrate": "turbo run db:migrate --filter=@saas/database",
        "docker:up":
          "docker compose -f docker/docker-compose.yml up --build -d",
        "docker:down": "docker compose -f docker/docker-compose.yml down",
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        "@eslint/js": "^9.0.0",
        "@typescript-eslint/eslint-plugin": "^8.0.0",
        "@typescript-eslint/parser": "^8.0.0",
        eslint: "^9.0.0",
        globals: "^15.0.0",
        prettier: "^3.4.0",
        turbo: "^2.8.10",
        typescript: "5.7.3",
      },
      engines: { node: ">=18" },
      packageManager: pmVersions[pkgManager],
      workspaces: ["apps/*", "packages/*"],
    },
    null,
    2,
  );
}

// ─── turbo.json ───────────────────────────────────────────────────────────────

export function turboJson(): string {
  return JSON.stringify(
    {
      $schema: "https://turborepo.dev/schema.json",
      ui: "tui",
      tasks: {
        build: {
          dependsOn: ["^build"],
          inputs: ["$TURBO_DEFAULT$", ".env*"],
          outputs: ["dist/**"],
        },
        "check-types": { dependsOn: ["^check-types"] },
        lint: { dependsOn: ["^lint"] },
        test: {
          dependsOn: ["^build"],
          inputs: ["src/**", "*.test.ts", "vitest.config.*"],
          outputs: ["coverage/**"],
        },
        dev: { cache: false, persistent: true },
        "db:generate": { cache: false },
        "db:migrate": { cache: false },
      },
    },
    null,
    2,
  );
}

// ─── .gitignore ───────────────────────────────────────────────────────────────

export function gitignoreTemplate(): string {
  return `node_modules/
dist/
.env
.env.local
.turbo/
coverage/
*.log
*.db
bun.lockb
pnpm-lock.yaml
package-lock.json
.DS_Store
`;
}

// ─── .npmrc ───────────────────────────────────────────────────────────────────

export function npmrcTemplate(a: ProjectAnswers): string {
  if (a.packageManager === "pnpm") {
    return `shamefully-hoist=true\n`;
  }
  return ``;
}

// ─── .env.example ─────────────────────────────────────────────────────────────

export function envExampleTemplate(a: ProjectAnswers): string {
  const isMongo = a.database === "mongodb-mongoose";
  const dbLine = isMongo
    ? `MONGODB_URI=mongodb://localhost:27017/${a.projectName}`
    : `DATABASE_URL=postgres://saas:saaspassword@localhost:5432/saas`;

  const redisLine =
    a.includeQueue || a.rateLimit === "redis"
      ? `\n# ─── Redis ──────────────────────────────────────────────────────────────────\nREDIS_URL=redis://localhost:6379`
      : "";

  const rateLimitSection =
    a.rateLimit !== "none"
      ? `\n# ─── Rate Limiting ───────────────────────────────────────────────────────────\nRATE_LIMIT_WINDOW_MS=60000\nRATE_LIMIT_MAX_REQUESTS=100`
      : "";

  const paymentsSection = a.includePayments
    ? `\n# ─── Razorpay ────────────────────────────────────────────────────────────────\nRAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx\nRAZORPAY_KEY_SECRET=change-me\nRAZORPAY_WEBHOOK_SECRET=change-me`
    : "";

  const emailSection =
    a.emailProvider === "resend"
      ? `\n# ─── Email (Resend) ──────────────────────────────────────────────────────────\nRESEND_API_KEY=re_xxxxxxxxxxxx\nEMAIL_FROM=noreply@yoursaas.com`
      : a.emailProvider === "nodemailer"
        ? `\n# ─── Email (SMTP) ────────────────────────────────────────────────────────────\nSMTP_HOST=smtp.example.com\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=user@example.com\nSMTP_PASS=change-me\nEMAIL_FROM=noreply@yoursaas.com`
        : "";

  return `# ─── Application ─────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ─── Database ─────────────────────────────────────────────────────────────────
${dbLine}
${redisLine}

# ─── Auth ─────────────────────────────────────────────────────────────────────
JWT_SECRET=change-me-to-a-long-random-secret-32-chars-min
JWT_EXPIRES_IN=7d

# ─── Admin ────────────────────────────────────────────────────────────────────
ADMIN_SECRET=change-me-admin-secret
${rateLimitSection}
${paymentsSection}
${emailSection}

# ─── Observability ────────────────────────────────────────────────────────────
LOG_LEVEL=info
`;
}

// ─── API app package.json ─────────────────────────────────────────────────────

export function apiPackageJson(a: ProjectAnswers): string {
  const dbDeps = dbDependencies(a.database);
  const rateDeps = rateLimitDependencies(a.rateLimit);

  const deps: Record<string, string> = {
    express: "^4.21.2",
    helmet: "^8.0.0",
    cors: "^2.8.5",
    "@saas/config": "*",
    "@saas/logger": "*",
    "@saas/types": "*",
    ...dbDeps,
    ...rateDeps,
  };

  if (a.includeAuth) deps["@saas/auth"] = "*";
  if (a.includeQueue) {
    deps["@saas/queue"] = "*";
    deps["@saas/redis"] = "*";
    deps["bullmq"] = "^5.0.0";
  }
  if (a.includePayments) deps["@saas/payments"] = "*";
  if (a.emailProvider !== "none") deps["@saas/email"] = "*";

  return JSON.stringify(
    {
      name: "@saas/api",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "tsx watch src/index.ts",
        build: "tsc --project tsconfig.build.json",
        start: "node dist/index.js",
        "check-types": "tsc --noEmit",
        lint: "eslint src/",
      },
      dependencies: deps,
      devDependencies: {
        "@saas/typescript-config": "*",
        "@types/cors": "^2.8.18",
        "@types/express": "^5.0.1",
        "@types/node": "^22.0.0",
        tsx: "^4.19.3",
        typescript: "5.7.3",
        vitest: "^3.0.7",
      },
    },
    null,
    2,
  );
}

// ─── Worker app package.json ──────────────────────────────────────────────────

export function workerPackageJson(a: ProjectAnswers): string {
  const dbDeps = dbDependencies(a.database);

  const deps: Record<string, string> = {
    bullmq: "^5.0.0",
    "@saas/config": "*",
    "@saas/logger": "*",
    "@saas/redis": "*",
    "@saas/types": "*",
    ...dbDeps,
  };

  if (a.includeQueue) deps["@saas/queue"] = "*";

  return JSON.stringify(
    {
      name: "@saas/worker",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "tsx watch src/index.ts",
        build: "tsc --project tsconfig.build.json",
        start: "node dist/index.js",
        "check-types": "tsc --noEmit",
        lint: "eslint src/",
      },
      dependencies: deps,
      devDependencies: {
        "@saas/typescript-config": "*",
        "@types/node": "^22.0.0",
        tsx: "^4.19.3",
        typescript: "5.7.3",
        vitest: "^3.0.7",
      },
    },
    null,
    2,
  );
}

// ─── Shared tsconfig.json for apps ───────────────────────────────────────────

export function appTsconfig(): string {
  return JSON.stringify(
    {
      extends: "@saas/typescript-config/base.json",
      compilerOptions: {
        outDir: "./dist",
        rootDir: "./src",
      },
      include: ["src"],
    },
    null,
    2,
  );
}

export function appTsconfigBuild(): string {
  return JSON.stringify(
    {
      extends: "./tsconfig.json",
      exclude: ["node_modules", "dist", "**/*.test.ts"],
    },
    null,
    2,
  );
}

// ─── API source files ─────────────────────────────────────────────────────────

export function apiIndexTs(): string {
  return `import { createApp } from "./app.js";
import { config } from "@saas/config";
import { createLogger } from "@saas/logger";

const logger = createLogger("api");

createApp().then((app) => {
  app.listen(config.port, () => {
    logger.info({ port: config.port }, "API server started");
  });
}).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
`;
}

export function apiAppTs(a: ProjectAnswers): string {
  const isMongo = a.database === "mongodb-mongoose";
  const dbImport = isMongo
    ? `import { connectDb } from "@saas/database";`
    : `import { db } from "@saas/database";`;

  const rateLimitImport =
    a.rateLimit !== "none"
      ? `import { rateLimitMiddleware } from "./middleware/rateLimit.js";`
      : "";

  const authImport = a.includeAuth
    ? `import { authMiddleware } from "@saas/auth";`
    : "";

  const queueImport = a.includeQueue
    ? `import { createQueues } from "@saas/queue";
import { getRedisClient } from "@saas/redis";`
    : "";

  const queueSetup = a.includeQueue
    ? `\n  const redis = getRedisClient();
  const _queues = createQueues(redis);`
    : "";

  const mongoSetup = isMongo ? `\n  await connectDb();` : "";

  const rateLimitUse =
    a.rateLimit !== "none" ? `\n  app.use(rateLimitMiddleware());` : "";

  const authUse = a.includeAuth
    ? `\n  // Protected routes — attach auth middleware where needed\n  // app.use("/api/v1", authMiddleware(), ...routes);`
    : "";

  return `import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { createLogger } from "@saas/logger";
${dbImport}
${queueImport}
${rateLimitImport}
${authImport}
import { healthRouter } from "./routes/health.js";

export async function createApp(): Promise<Express> {
  const app = express();
  const logger = createLogger("api");
  ${mongoSetup}
  ${queueSetup}

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  ${rateLimitUse}
  ${authUse}

  app.use("/health", healthRouter());

  // TODO: add your routes here
  // app.use("/api/v1", tenantMiddleware(), yourRouter());

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error({ err }, "Unhandled error");
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  );

  return app;
}
`;
}

export function apiHealthRouteTs(): string {
  return `import { Router } from "express";

export function healthRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return router;
}
`;
}

export function apiRateLimitTs(strategy: RateLimitChoice): string {
  if (strategy === "redis") {
    return `import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "@saas/redis";
import type { RequestHandler } from "express";

export function rateLimitMiddleware(): RequestHandler {
  const client = getRedisClient();
  return rateLimit({
    windowMs: parseInt(process.env["RATE_LIMIT_WINDOW_MS"] ?? "60000"),
    max: parseInt(process.env["RATE_LIMIT_MAX_REQUESTS"] ?? "100"),
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({ sendCommand: (...args) => client.call(...args) }),
  });
}
`;
  }

  return `import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

export function rateLimitMiddleware(): RequestHandler {
  return rateLimit({
    windowMs: parseInt(process.env["RATE_LIMIT_WINDOW_MS"] ?? "60000"),
    max: parseInt(process.env["RATE_LIMIT_MAX_REQUESTS"] ?? "100"),
    standardHeaders: true,
    legacyHeaders: false,
  });
}
`;
}

// ─── Worker source files ──────────────────────────────────────────────────────

export function workerIndexTs(): string {
  return `import { Worker } from "bullmq";
import { getRedisClient } from "@saas/redis";
import { createLogger } from "@saas/logger";

const logger = createLogger("worker");
const redis = getRedisClient();

const worker = new Worker(
  "default",
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "Processing job");
    // TODO: handle your jobs here
  },
  { connection: redis }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Job failed");
});

logger.info("Worker started, listening for jobs...");
`;
}

// ─── Database package ─────────────────────────────────────────────────────────

export function dbPackageJson(db: DatabaseChoice): string {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {
    "@saas/typescript-config": "*",
    typescript: "5.7.3",
  };
  const scripts: Record<string, string> = {
    "check-types": "tsc --noEmit",
  };

  if (db === "mongodb-mongoose") {
    deps["mongoose"] = "^8.0.0";
  } else if (db === "postgres-drizzle" || db === "sqlite-drizzle") {
    deps["drizzle-orm"] = "^0.40.0";
    if (db === "postgres-drizzle") deps["postgres"] = "^3.4.5";
    if (db === "sqlite-drizzle") deps["better-sqlite3"] = "^9.0.0";
    devDeps["drizzle-kit"] = "^0.30.4";
    scripts["db:generate"] = "drizzle-kit generate";
    scripts["db:migrate"] = "drizzle-kit migrate";
    scripts["db:push"] = "drizzle-kit push";
    scripts["db:studio"] = "drizzle-kit studio";
  } else if (db === "postgres-prisma") {
    deps["@prisma/client"] = "^5.0.0";
    devDeps["prisma"] = "^5.0.0";
    scripts["db:generate"] = "prisma generate";
    scripts["db:migrate"] = "prisma migrate dev";
    scripts["db:push"] = "prisma db push";
    scripts["db:studio"] = "prisma studio";
  }

  return JSON.stringify(
    {
      name: "@saas/database",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts,
      dependencies: deps,
      devDependencies: devDeps,
    },
    null,
    2,
  );
}

export function dbIndexTs(db: DatabaseChoice): string {
  if (db === "mongodb-mongoose") {
    return `import mongoose from "mongoose";

export async function connectDb(): Promise<void> {
  const uri = process.env["MONGODB_URI"];
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
}

export { mongoose };
`;
  }

  if (db === "postgres-drizzle") {
    return `import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString);
export const db = drizzle(client);
`;
  }

  if (db === "postgres-prisma") {
    return `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = db;
`;
  }

  // sqlite-drizzle
  return `import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("./local.db");
export const db = drizzle(sqlite);
`;
}

// ─── Config package ───────────────────────────────────────────────────────────

export function configPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/config",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      devDependencies: {
        "@saas/typescript-config": "*",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function configIndexTs(): string {
  return `export const config = {
  port: parseInt(process.env["PORT"] ?? "3000"),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  isDev: process.env["NODE_ENV"] !== "production",
  jwtSecret: process.env["JWT_SECRET"] ?? "change-me",
  jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
  adminSecret: process.env["ADMIN_SECRET"] ?? "change-me",
  logLevel: process.env["LOG_LEVEL"] ?? "info",
} as const;
`;
}

// ─── Logger package ───────────────────────────────────────────────────────────

export function loggerPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/logger",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      dependencies: { pino: "^9.0.0" },
      devDependencies: {
        "@saas/typescript-config": "*",
        "@types/node": "^22.0.0",
        "pino-pretty": "^13.0.0",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function loggerIndexTs(): string {
  return `import pino from "pino";

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env["LOG_LEVEL"] ?? "info",
    transport:
      process.env["NODE_ENV"] !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
`;
}

// ─── Auth package ─────────────────────────────────────────────────────────────

export function authPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/auth",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      dependencies: {
        jsonwebtoken: "^9.0.0",
        bcryptjs: "^2.4.3",
        "@saas/config": "*",
      },
      devDependencies: {
        "@saas/typescript-config": "*",
        "@types/jsonwebtoken": "^9.0.0",
        "@types/bcryptjs": "^2.4.0",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function authIndexTs(): string {
  return `import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "@saas/config";
import type { RequestHandler } from "express";

export function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function authMiddleware(): RequestHandler {
  return (req, res, next) => {
    const header = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: { message: "Unauthorized" } });
      return;
    }
    try {
      const token = header.slice(7);
      const payload = verifyToken(token);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).user = payload;
      next();
    } catch {
      res.status(401).json({ success: false, error: { message: "Invalid token" } });
    }
  };
}
`;
}

// ─── Queue package ────────────────────────────────────────────────────────────

export function queuePackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/queue",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      dependencies: {
        bullmq: "^5.0.0",
        "@saas/redis": "*",
      },
      devDependencies: {
        "@saas/typescript-config": "*",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function queueIndexTs(): string {
  return `import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export function createQueues(redis: Redis) {
  const defaultQueue = new Queue("default", { connection: redis });
  const emailQueue = new Queue("email", { connection: redis });

  return { defaultQueue, emailQueue };
}

export type Queues = ReturnType<typeof createQueues>;
`;
}

// ─── Redis package ────────────────────────────────────────────────────────────

export function redisPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/redis",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      dependencies: { ioredis: "^5.3.0" },
      devDependencies: {
        "@saas/typescript-config": "*",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function redisIndexTs(): string {
  return `import Redis from "ioredis";

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    client = new Redis(url, { maxRetriesPerRequest: null });
  }
  return client;
}
`;
}

// ─── Types package ────────────────────────────────────────────────────────────

export function typesPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/types",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      devDependencies: {
        "@saas/typescript-config": "*",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function typesIndexTs(): string {
  return `export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  createdAt: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}
`;
}

// ─── TypeScript config package ────────────────────────────────────────────────

export function typescriptConfigPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/typescript-config",
      version: "0.1.0",
      private: true,
      type: "module",
      exports: { "./base.json": "./base.json" },
    },
    null,
    2,
  );
}

export function typescriptConfigBase(): string {
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/tsconfig",
      display: "Base",
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
    },
    null,
    2,
  );
}

// ─── GitHub Actions CI ───────────────────────────────────────────────────────

export function githubActionsCiWorkflow(a: ProjectAnswers): string {
  const isBun = a.packageManager === "bun";
  const isPnpm = a.packageManager === "pnpm";

  const setupRuntime = isBun
    ? `      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.8`
    : `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: ${isPnpm ? "pnpm" : "npm"}`;

  const corepackStep = isPnpm
    ? `      - name: Enable Corepack
        run: corepack enable
`
    : "";

  const installCmd = isBun
    ? "bun install --frozen-lockfile"
    : isPnpm
      ? "pnpm install --frozen-lockfile"
      : "npm ci";

  const runCmd = isBun ? "bun run" : `${a.packageManager} run`;

  return `name: CI

on:
  push:
    branches: ["main"]
  pull_request:

permissions:
  contents: read

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
${setupRuntime}
${corepackStep}      - name: Install dependencies
        run: ${installCmd}
      - name: Type check
        run: ${runCmd} check-types
      - name: Lint
        run: ${runCmd} lint
      - name: Test
        run: ${runCmd} test
      - name: Build
        run: ${runCmd} build
`;
}

// ─── Docker compose ───────────────────────────────────────────────────────────

export function dockerComposeTemplate(a: ProjectAnswers): string {
  const isMongo = a.database === "mongodb-mongoose";
  const needsRedis =
    a.includeQueue || a.rateLimit === "redis" || a.includeWorker;

  const mongoService = isMongo
    ? `
  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
`
    : `
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: saas
      POSTGRES_PASSWORD: saaspassword
      POSTGRES_DB: saas
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U saas -d saas"]
      interval: 10s
      timeout: 5s
      retries: 5
`;

  const redisService = needsRedis
    ? `
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
`
    : "";

  const obsServices = a.includeObservability
    ? `
  loki:
    image: grafana/loki:latest
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki

  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./observability/grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      - prometheus
      - loki
`
    : "";

  const dbDepends = isMongo ? `mongo` : `postgres`;
  const redisDepends = needsRedis
    ? `\n      redis:\n        condition: service_healthy`
    : "";

  const apiService = `
  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      ${isMongo ? `MONGODB_URI: mongodb://mongo:27017/${a.projectName}` : `DATABASE_URL: postgres://saas:saaspassword@${dbDepends}:5432/saas`}
      ${needsRedis ? "REDIS_URL: redis://redis:6379" : ""}
    depends_on:
      ${dbDepends}:
        condition: service_healthy${redisDepends}
`;

  const workerService = a.includeWorker
    ? `
  worker:
    build:
      context: ..
      dockerfile: apps/worker/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      ${isMongo ? `MONGODB_URI: mongodb://mongo:27017/${a.projectName}` : `DATABASE_URL: postgres://saas:saaspassword@${dbDepends}:5432/saas`}
      REDIS_URL: redis://redis:6379
    depends_on:
      ${dbDepends}:
        condition: service_healthy
      redis:
        condition: service_healthy
`
    : "";

  const webService = a.includeWeb
    ? `
  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: http://api:3000
    depends_on:
      - api
`
    : "";

  const volumes = [
    isMongo ? "  mongo_data:" : "  postgres_data:",
    needsRedis ? "  redis_data:" : "",
    a.includeObservability
      ? "  loki_data:\n  prometheus_data:\n  grafana_data:"
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `services:
${mongoService}${redisService}${obsServices}${apiService}${workerService}${webService}
volumes:
${volumes}
`;
}

// ─── Dockerfile templates ─────────────────────────────────────────────────────

export function apiDockerfile(a: ProjectAnswers): string {
  const installCmd =
    a.packageManager === "bun"
      ? "RUN bun install --frozen-lockfile"
      : a.packageManager === "pnpm"
        ? "RUN pnpm install --frozen-lockfile"
        : "RUN npm ci";
  const buildCmd =
    a.packageManager === "bun"
      ? "RUN bun run build --filter=@saas/api"
      : a.packageManager === "pnpm"
        ? "RUN pnpm run build --filter=@saas/api"
        : "RUN npm run build --filter=@saas/api";
  const baseImage =
    a.packageManager === "bun" ? "oven/bun:1" : "node:22-alpine";

  return `FROM ${baseImage} AS base
WORKDIR /app

FROM base AS builder
COPY package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
${installCmd}
COPY . .
${buildCmd}

FROM node:22-alpine AS runner
WORKDIR /app/apps/api
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
RUN npm install --production
EXPOSE 3000
CMD ["node", "dist/index.js"]
`;
}

export function workerDockerfile(a: ProjectAnswers): string {
  const installCmd =
    a.packageManager === "bun"
      ? "RUN bun install --frozen-lockfile"
      : a.packageManager === "pnpm"
        ? "RUN pnpm install --frozen-lockfile"
        : "RUN npm ci";
  const buildCmd =
    a.packageManager === "bun"
      ? "RUN bun run build --filter=@saas/worker"
      : a.packageManager === "pnpm"
        ? "RUN pnpm run build --filter=@saas/worker"
        : "RUN npm run build --filter=@saas/worker";
  const baseImage =
    a.packageManager === "bun" ? "oven/bun:1" : "node:22-alpine";

  return `FROM ${baseImage} AS base
WORKDIR /app

FROM base AS builder
COPY package.json turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ ./packages/
${installCmd}
COPY . .
${buildCmd}

FROM node:22-alpine AS runner
WORKDIR /app/apps/worker
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/package.json ./
RUN npm install --production
CMD ["node", "dist/index.js"]
`;
}

// ─── README ───────────────────────────────────────────────────────────────────

export function rootReadme(a: ProjectAnswers): string {
  const pm = a.packageManager;
  const isMongo = a.database === "mongodb-mongoose";

  return `# ${a.projectName}

> Scaffolded with [create-saas-app](https://github.com/you/create-saas-app) 🚀

A production-ready **Multi-Tenant SaaS** Turborepo monorepo.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22+ |
| Framework | Express |
| Database | ${a.database} |
| Queue | ${a.includeQueue ? "BullMQ + Redis" : "—"} |
| Auth | ${a.includeAuth ? "JWT (jsonwebtoken + bcryptjs)" : "—"} |
| Rate Limiting | ${a.rateLimit === "none" ? "—" : a.rateLimit === "redis" ? "Redis-backed (rate-limit-redis)" : "In-memory (express-rate-limit)"} |
| Monorepo | Turborepo |
| Build | TypeScript |

## Getting Started

\`\`\`bash
# 1. Install dependencies
${pm} install

# 2. Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# 3. Copy & fill in env vars
cp apps/api/.env.example apps/api/.env
${isMongo ? "" : "\n# 4. Run migrations\n" + pm + " run db:migrate"}

# ${isMongo ? "4" : "5"}. Start dev servers
${pm} run dev
\`\`\`

## Project Structure

\`\`\`
${a.projectName}/
├── apps/
│   ├── api/           # Express REST API
${a.includeWorker ? "│   └── worker/        # BullMQ background worker\n" : ""}└── packages/
    ├── config/        # Shared env config
    ├── database/      # DB client & models
    ├── logger/        # Pino logger
${a.includeAuth ? "    ├── auth/          # JWT auth utilities\n" : ""}${a.includeQueue ? "    ├── queue/         # BullMQ queue definitions\n    ├── redis/         # Redis client\n" : ""}    ├── types/         # Shared TypeScript types
    └── typescript-config/
\`\`\`

## Scripts

| Command | Description |
|---------|-------------|
| \`${pm} run dev\` | Start all apps in watch mode |
| \`${pm} run build\` | Build all packages |
| \`${pm} run lint\` | Lint all packages |
| \`${pm} run check-types\` | Type-check all packages |
${isMongo ? "" : "| `" + pm + " run db:generate` | Generate DB migrations |\n| `" + pm + " run db:migrate` | Run DB migrations |"}

---

_Generated by \`create-saas-app\`_
`;
}

// ─── Drizzle config ───────────────────────────────────────────────────────────

export function drizzleConfigTs(db: DatabaseChoice): string {
  if (db === "sqlite-drizzle") {
    return `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./local.db",
  },
});
`;
  }
  // postgres-drizzle
  return `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
`;
}

export function drizzleSchemaTs(db: DatabaseChoice): string {
  if (db === "sqlite-drizzle") {
    return `import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan", { enum: ["free", "pro", "enterprise"] }).notNull().default("free"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
`;
  }
  // postgres-drizzle
  return `import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
`;
}

// ─── Prisma schema ────────────────────────────────────────────────────────────

export function prismaSchemaTemplate(projectName: string): string {
  return `// This is your Prisma schema file.
// Learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Plan {
  free
  pro
  enterprise
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  plan      Plan     @default(free)
  createdAt DateTime @default(now()) @map("created_at")

  @@map("tenants")
}
`;
}

// ─── Vitest config ────────────────────────────────────────────────────────────

export function vitestConfigTs(): string {
  return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      reporter: ["text", "lcov"],
      exclude: ["node_modules/", "dist/"],
    },
  },
});
`;
}

// ─── ESLint flat config ───────────────────────────────────────────────────────

export function eslintConfigTs(): string {
  return `import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: true },
      globals: { ...globals.node },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/"],
  },
];
`;
}

export function eslintDevDeps(): Record<string, string> {
  return {
    "@eslint/js": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    eslint: "^9.0.0",
    globals: "^15.0.0",
  };
}

// ─── Prettier config ──────────────────────────────────────────────────────────

export function prettierRc(): string {
  return JSON.stringify(
    {
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "all",
      printWidth: 100,
    },
    null,
    2,
  );
}

// ─── Tenant middleware ────────────────────────────────────────────────────────

export function tenantMiddlewareTs(): string {
  return `import type { RequestHandler } from "express";

/**
 * Resolves the tenant from the request.
 * Extend this to look up the tenant from a DB using slug / subdomain / header.
 */
export function tenantMiddleware(): RequestHandler {
  return async (req, res, next) => {
    // Option A: resolve from subdomain  (e.g. acme.yoursaas.com → "acme")
    // const host = req.hostname;
    // const slug = host.split(".")[0];

    // Option B: resolve from a custom header  X-Tenant-Slug: acme
    const slug = req.headers["x-tenant-slug"] as string | undefined;

    if (!slug) {
      res.status(400).json({ success: false, error: { message: "Missing tenant identifier" } });
      return;
    }

    // TODO: look up the tenant in your DB and attach it to req
    // const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
    // if (!tenant) { res.status(404).json({ ... }); return; }
    // (req as any).tenant = tenant;

    // For now, just pass the slug along so you can start building
    (req as any).tenantSlug = slug;
    next();
  };
}
`;
}

// ─── Worker .env.example ─────────────────────────────────────────────────────

export function workerEnvExampleTemplate(a: ProjectAnswers): string {
  const isMongo = a.database === "mongodb-mongoose";
  const dbLine = isMongo
    ? `MONGODB_URI=mongodb://localhost:27017/${a.projectName}`
    : `DATABASE_URL=postgres://saas:saaspassword@localhost:5432/saas`;

  return `# ─── Application ─────────────────────────────────────────────────────────────
NODE_ENV=development

# ─── Database ─────────────────────────────────────────────────────────────────
${dbLine}

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Observability ────────────────────────────────────────────────────────────
LOG_LEVEL=info
`;
}

// ─── Grafana provisioning ─────────────────────────────────────────────────────

export function grafanaDatasourceYaml(): string {
  return `apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: true
`;
}

// ─── Next.js 15 web app ───────────────────────────────────────────────────────

export function webPackageJson(a: ProjectAnswers): string {
  const deps: Record<string, string> = {
    next: "15.2.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    "@saas/config": "*",
    "@saas/types": "*",
  };
  if (a.includeAuth) deps["@saas/auth"] = "*";
  if (a.emailProvider !== "none") deps["@saas/email"] = "*";

  return JSON.stringify(
    {
      name: "@saas/web",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev --turbopack",
        build: "next build",
        start: "next start",
        lint: "next lint",
        "check-types": "tsc --noEmit",
      },
      dependencies: deps,
      devDependencies: {
        "@saas/typescript-config": "*",
        "@types/node": "^22.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function webNextConfig(): string {
  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@saas/config",
    "@saas/types",
    "@saas/auth",
    "@saas/email",
  ],
};

export default nextConfig;
`;
}

export function webTsconfig(): string {
  return JSON.stringify(
    {
      extends: "@saas/typescript-config/base.json",
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  );
}

export function webRootLayout(a: ProjectAnswers): string {
  return `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "${a.projectName}",
  description: "Multi-Tenant SaaS Application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
`;
}

export function webGlobalsCss(): string {
  return `@import "tailwindcss";
`;
}

export function webHomePage(a: ProjectAnswers): string {
  return `export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 680, margin: "80px auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "2.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Welcome to <span style={{ color: "#0070f3" }}>${a.projectName}</span>
      </h1>
      <p style={{ color: "#666", fontSize: "1.125rem", marginBottom: "2rem" }}>
        Your production-ready Multi-Tenant SaaS platform.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <a
          href="/dashboard"
          style={{
            padding: "0.75rem 1.5rem",
            background: "#0070f3",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Dashboard →
        </a>
        <a
          href="/login"
          style={{
            padding: "0.75rem 1.5rem",
            background: "#f5f5f5",
            color: "#333",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Sign In
        </a>
      </div>
    </main>
  );
}
`;
}

export function webDashboardPage(): string {
  return `// Protected — add your auth check here (e.g. read a cookie, call the API)
export default function DashboardPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "40px auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Dashboard</h1>
      <p style={{ color: "#666" }}>You are signed in. Build your SaaS here.</p>

      <div
        style={{
          background: "#f9f9f9",
          border: "1px solid #eee",
          borderRadius: 12,
          padding: "2rem",
          marginTop: "2rem",
        }}
      >
        <p style={{ margin: 0, color: "#888" }}>
          📦 Workspace ready — start adding your features.
        </p>
      </div>
    </main>
  );
}
`;
}

export function webLoginPage(): string {
  return `"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        \`\${process.env["NEXT_PUBLIC_API_URL"]}/api/v1/auth/login\`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Login failed");
      // TODO: store token (cookie / localStorage) and redirect
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 400,
        margin: "100px auto",
        padding: "0 1rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Sign in
      </h1>
      {error && (
        <p style={{ color: "#e00", marginBottom: "1rem", fontSize: "0.9rem" }}>
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: "0.75rem", borderRadius: 8, border: "1px solid #ddd", fontSize: "1rem" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: "0.75rem", borderRadius: 8, border: "1px solid #ddd", fontSize: "1rem" }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.75rem",
            background: "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "1rem",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
`;
}

export function webMiddleware(): string {
  return `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/api/auth")
  );

  if (isPublic) return NextResponse.next();

  // Read the JWT stored in an httpOnly cookie after login
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // NOTE: full JWT verification should happen in your API, not here.
  // Middleware only does a lightweight "token present" check for UX.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}

export function webEnvExample(a: ProjectAnswers): string {
  return `# ─── API connection ───────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3000

# ─── Auth ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3001
${a.includePayments ? `\n# ─── Razorpay ────────────────────────────────────────────────────────────────\nNEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx` : ""}
`;
}

export function webDockerfile(a: ProjectAnswers): string {
  const installCmd =
    a.packageManager === "bun"
      ? "RUN bun install --frozen-lockfile"
      : a.packageManager === "pnpm"
        ? "RUN pnpm install --frozen-lockfile"
        : "RUN npm ci";
  const baseImage =
    a.packageManager === "bun" ? "oven/bun:1" : "node:22-alpine";

  return `FROM ${baseImage} AS base
WORKDIR /app

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
${installCmd}
COPY . .
RUN npm run build --filter=@saas/web

FROM node:22-alpine AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
`;
}

// ─── Razorpay payments package ────────────────────────────────────────────────

export function paymentsPackageJson(): string {
  return JSON.stringify(
    {
      name: "@saas/payments",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      dependencies: {
        razorpay: "^2.9.4",
        "@saas/config": "*",
        "@saas/logger": "*",
      },
      devDependencies: {
        "@saas/typescript-config": "*",
        "@types/node": "^22.0.0",
        typescript: "5.7.3",
      },
    },
    null,
    2,
  );
}

export function paymentsIndexTs(): string {
  return `import Razorpay from "razorpay";
import crypto from "node:crypto";
import { createLogger } from "@saas/logger";

const logger = createLogger("payments");

let instance: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!instance) {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
    }
    instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return instance;
}

export interface CreateOrderOptions {
  amountInPaise: number; // e.g. 49900 = ₹499.00
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export async function createOrder(opts: CreateOrderOptions) {
  const rz = getRazorpayClient();
  const order = await rz.orders.create({
    amount: opts.amountInPaise,
    currency: opts.currency ?? "INR",
    receipt: opts.receipt,
    notes: opts.notes,
  });
  logger.info({ orderId: order.id, amount: opts.amountInPaise }, "Razorpay order created");
  return order;
}

/**
 * Verify Razorpay webhook signature.
 * @param rawBody   - Raw request body string (before JSON.parse)
 * @param signature - Value of the X-Razorpay-Signature header
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Verify Razorpay payment signature (client-side callback verification).
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET is not set");
  const body = \`\${orderId}|\${paymentId}\`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
`;
}

export function paymentsRouteTs(): string {
  return `import { Router } from "express";
import { createOrder, verifyWebhookSignature, verifyPaymentSignature } from "@saas/payments";
import { createLogger } from "@saas/logger";
import type { RequestHandler } from "express";

const logger = createLogger("payments-route");

export function paymentsRouter(): Router {
  const router = Router();

  // POST /payments/order — create a Razorpay order
  router.post("/order", (async (req, res) => {
    const { amountInPaise, currency, receipt, notes } = req.body as {
      amountInPaise: number;
      currency?: string;
      receipt?: string;
      notes?: Record<string, string>;
    };

    if (!amountInPaise || amountInPaise < 100) {
      res.status(400).json({ success: false, error: { message: "Invalid amount" } });
      return;
    }

    try {
      const order = await createOrder({ amountInPaise, currency, receipt, notes });
      res.json({ success: true, data: order });
    } catch (err) {
      logger.error({ err }, "Failed to create Razorpay order");
      res.status(500).json({ success: false, error: { message: "Failed to create order" } });
    }
  }) as RequestHandler);

  // POST /payments/verify — verify payment after client callback
  router.post("/verify", ((req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body as {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      };

    const valid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!valid) {
      res.status(400).json({ success: false, error: { message: "Invalid payment signature" } });
      return;
    }

    // TODO: update subscription/plan in your DB here
    logger.info({ orderId: razorpay_order_id, paymentId: razorpay_payment_id }, "Payment verified");
    res.json({ success: true, data: { paymentId: razorpay_payment_id } });
  }) as RequestHandler);

  // POST /payments/webhook — Razorpay server-to-server events
  router.post("/webhook", ((req, res) => {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    if (!signature) {
      res.status(400).json({ success: false, error: { message: "Missing signature" } });
      return;
    }

    // express.raw() middleware must be applied to this route for rawBody access
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    try {
      const valid = verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        res.status(400).json({ success: false, error: { message: "Invalid webhook signature" } });
        return;
      }
    } catch (err) {
      logger.error({ err }, "Webhook verification error");
      res.status(500).json({ success: false, error: { message: "Webhook error" } });
      return;
    }

    const event = req.body as { event: string; payload: unknown };
    logger.info({ event: event.event }, "Razorpay webhook received");

    // Handle events
    switch (event.event) {
      case "payment.captured":
        // TODO: activate subscription
        break;
      case "payment.failed":
        // TODO: notify user
        break;
      case "subscription.charged":
        // TODO: update subscription period
        break;
    }

    res.json({ success: true });
  }) as RequestHandler);

  return router;
}
`;
}

// ─── Email package ────────────────────────────────────────────────────────────

export function emailPackageJson(provider: "resend" | "nodemailer"): string {
  const deps: Record<string, string> = { "@saas/config": "*" };
  const devDeps: Record<string, string> = {
    "@saas/typescript-config": "*",
    "@types/node": "^22.0.0",
    typescript: "5.7.3",
  };

  if (provider === "resend") {
    deps["resend"] = "^4.0.0";
  } else {
    deps["nodemailer"] = "^6.9.0";
    devDeps["@types/nodemailer"] = "^6.4.0";
  }

  return JSON.stringify(
    {
      name: "@saas/email",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      exports: { ".": "./src/index.ts" },
      scripts: { "check-types": "tsc --noEmit" },
      dependencies: deps,
      devDependencies: devDeps,
    },
    null,
    2,
  );
}

export function emailIndexTs(provider: "resend" | "nodemailer"): string {
  if (provider === "resend") {
    return `import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const from = opts.from ?? process.env["EMAIL_FROM"] ?? "noreply@yoursaas.com";
  const { error } = await getClient().emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw new Error(\`Failed to send email: \${error.message}\`);
}

// ─── Template helpers ──────────────────────────────────────────────────────────

export function welcomeEmail(name: string): string {
  return \`<h1>Welcome, \${name}!</h1><p>Thanks for signing up. Let's get started.</p>\`;
}

export function passwordResetEmail(resetUrl: string): string {
  return \`<h1>Reset your password</h1><p><a href="\${resetUrl}">Click here</a> to reset your password. This link expires in 1 hour.</p>\`;
}
`;
  }

  // nodemailer
  return `import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env["SMTP_HOST"] ?? "localhost",
      port: parseInt(process.env["SMTP_PORT"] ?? "587"),
      secure: process.env["SMTP_SECURE"] === "true",
      auth:
        process.env["SMTP_USER"] && process.env["SMTP_PASS"]
          ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] }
          : undefined,
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const from = opts.from ?? process.env["EMAIL_FROM"] ?? "noreply@yoursaas.com";
  await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
}

// ─── Template helpers ──────────────────────────────────────────────────────────

export function welcomeEmail(name: string): string {
  return \`<h1>Welcome, \${name}!</h1><p>Thanks for signing up. Let's get started.</p>\`;
}

export function passwordResetEmail(resetUrl: string): string {
  return \`<h1>Reset your password</h1><p><a href="\${resetUrl}">Click here</a> to reset your password. This link expires in 1 hour.</p>\`;
}
`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbDependencies(db: DatabaseChoice): Record<string, string> {
  if (db === "mongodb-mongoose")
    return { "@saas/database": "*", mongoose: "^8.0.0" };
  if (db === "postgres-drizzle")
    return {
      "@saas/database": "*",
      "drizzle-orm": "^0.40.0",
      postgres: "^3.4.5",
    };
  if (db === "postgres-prisma")
    return { "@saas/database": "*", "@prisma/client": "^5.0.0" };
  return {
    "@saas/database": "*",
    "drizzle-orm": "^0.40.0",
    "better-sqlite3": "^9.0.0",
  };
}

function rateLimitDependencies(r: RateLimitChoice): Record<string, string> {
  if (r === "none") return {};
  if (r === "redis")
    return { "express-rate-limit": "^7.0.0", "rate-limit-redis": "^4.0.0" };
  return { "express-rate-limit": "^7.0.0" };
}
