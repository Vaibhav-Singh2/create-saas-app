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
      ? `\n# ─── Redis ──────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379`
      : "";

  const rateLimitSection =
    a.rateLimit !== "none"
      ? `\n# ─── Rate Limiting ───────────────────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100`
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
${mongoService}${redisService}${obsServices}${apiService}${workerService}
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
