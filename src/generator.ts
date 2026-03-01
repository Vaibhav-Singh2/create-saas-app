import path from "node:path";
import fs from "node:fs";
import { write, mkdirp, runCommand } from "./utils.js";
import type { ProjectAnswers } from "./prompts.js";
import {
  rootPackageJson,
  turboJson,
  gitignoreTemplate,
  npmrcTemplate,
  envExampleTemplate,
  apiPackageJson,
  workerPackageJson,
  appTsconfig,
  appTsconfigBuild,
  apiIndexTs,
  apiAppTs,
  apiHealthRouteTs,
  apiRateLimitTs,
  workerIndexTs,
  dbPackageJson,
  dbIndexTs,
  drizzleConfigTs,
  drizzleSchemaTs,
  prismaSchemaTemplate,
  configPackageJson,
  configIndexTs,
  loggerPackageJson,
  loggerIndexTs,
  authPackageJson,
  authIndexTs,
  queuePackageJson,
  queueIndexTs,
  redisPackageJson,
  redisIndexTs,
  typesPackageJson,
  typesIndexTs,
  typescriptConfigPackageJson,
  typescriptConfigBase,
  dockerComposeTemplate,
  apiDockerfile,
  workerDockerfile,
  rootReadme,
  vitestConfigTs,
  eslintConfigTs,
  eslintDevDeps,
  prettierRc,
  tenantMiddlewareTs,
  workerEnvExampleTemplate,
  grafanaDatasourceYaml,
} from "./templates.js";

// ─── Shared tsconfig.json for every package ───────────────────────────────────

function pkgTsconfig(): string {
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

// ─── Directory exists guard ───────────────────────────────────────────────────

export function projectDirectoryExists(name: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), name));
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function generateProject(a: ProjectAnswers): Promise<void> {
  const root = path.resolve(process.cwd(), a.projectName);

  // ── Root files ──────────────────────────────────────────────────────────────
  mkdirp(root);
  write(path.join(root, "package.json"), rootPackageJson(a));
  write(path.join(root, "turbo.json"), turboJson());
  write(path.join(root, ".gitignore"), gitignoreTemplate());
  const npmrc = npmrcTemplate(a);
  if (npmrc) write(path.join(root, ".npmrc"), npmrc);
  write(path.join(root, "README.md"), rootReadme(a));
  write(path.join(root, ".prettierrc"), prettierRc());
  write(path.join(root, "eslint.config.ts"), eslintConfigTs());

  // ── TypeScript config package ───────────────────────────────────────────────
  const tsConfigPkg = path.join(root, "packages", "typescript-config");
  write(path.join(tsConfigPkg, "package.json"), typescriptConfigPackageJson());
  write(path.join(tsConfigPkg, "base.json"), typescriptConfigBase());

  // ── Config package ──────────────────────────────────────────────────────────
  const configPkg = path.join(root, "packages", "config");
  write(path.join(configPkg, "package.json"), configPackageJson());
  write(path.join(configPkg, "src", "index.ts"), configIndexTs());
  write(path.join(configPkg, "tsconfig.json"), pkgTsconfig());

  // ── Logger package ──────────────────────────────────────────────────────────
  const loggerPkg = path.join(root, "packages", "logger");
  write(path.join(loggerPkg, "package.json"), loggerPackageJson());
  write(path.join(loggerPkg, "src", "index.ts"), loggerIndexTs());
  write(path.join(loggerPkg, "tsconfig.json"), pkgTsconfig());

  // ── Types package ───────────────────────────────────────────────────────────
  const typesPkg = path.join(root, "packages", "types");
  write(path.join(typesPkg, "package.json"), typesPackageJson());
  write(path.join(typesPkg, "src", "index.ts"), typesIndexTs());
  write(path.join(typesPkg, "tsconfig.json"), pkgTsconfig());

  // ── Database package ────────────────────────────────────────────────────────
  const dbPkg = path.join(root, "packages", "database");
  write(path.join(dbPkg, "package.json"), dbPackageJson(a.database));
  write(path.join(dbPkg, "src", "index.ts"), dbIndexTs(a.database));
  write(path.join(dbPkg, "tsconfig.json"), pkgTsconfig());

  // Drizzle: schema + config
  if (a.database === "postgres-drizzle" || a.database === "sqlite-drizzle") {
    write(path.join(dbPkg, "src", "schema.ts"), drizzleSchemaTs(a.database));
    write(path.join(dbPkg, "drizzle.config.ts"), drizzleConfigTs(a.database));
  }

  // Prisma: schema.prisma
  if (a.database === "postgres-prisma") {
    write(
      path.join(dbPkg, "prisma", "schema.prisma"),
      prismaSchemaTemplate(a.projectName),
    );
  }

  // ── Auth package (optional) ─────────────────────────────────────────────────
  if (a.includeAuth) {
    const authPkg = path.join(root, "packages", "auth");
    write(path.join(authPkg, "package.json"), authPackageJson());
    write(path.join(authPkg, "src", "index.ts"), authIndexTs());
    write(path.join(authPkg, "tsconfig.json"), pkgTsconfig());
  }

  // ── Redis package (optional) ────────────────────────────────────────────────
  const needsRedis =
    a.includeQueue || a.rateLimit === "redis" || a.includeWorker;
  if (needsRedis) {
    const redisPkg = path.join(root, "packages", "redis");
    write(path.join(redisPkg, "package.json"), redisPackageJson());
    write(path.join(redisPkg, "src", "index.ts"), redisIndexTs());
    write(path.join(redisPkg, "tsconfig.json"), pkgTsconfig());
  }

  // ── Queue package (optional) ────────────────────────────────────────────────
  if (a.includeQueue) {
    const queuePkg = path.join(root, "packages", "queue");
    write(path.join(queuePkg, "package.json"), queuePackageJson());
    write(path.join(queuePkg, "src", "index.ts"), queueIndexTs());
    write(path.join(queuePkg, "tsconfig.json"), pkgTsconfig());
  }

  // ── API app ─────────────────────────────────────────────────────────────────
  const apiApp = path.join(root, "apps", "api");
  write(path.join(apiApp, "package.json"), apiPackageJson(a));
  write(path.join(apiApp, "tsconfig.json"), appTsconfig());
  write(path.join(apiApp, "tsconfig.build.json"), appTsconfigBuild());
  write(path.join(apiApp, ".env.example"), envExampleTemplate(a));
  write(path.join(apiApp, "vitest.config.ts"), vitestConfigTs());
  write(path.join(apiApp, "src", "index.ts"), apiIndexTs());
  write(path.join(apiApp, "src", "app.ts"), apiAppTs(a));
  write(path.join(apiApp, "src", "routes", "health.ts"), apiHealthRouteTs());
  write(
    path.join(apiApp, "src", "middleware", "tenant.ts"),
    tenantMiddlewareTs(),
  );
  write(path.join(apiApp, "Dockerfile"), apiDockerfile(a));

  if (a.rateLimit !== "none") {
    write(
      path.join(apiApp, "src", "middleware", "rateLimit.ts"),
      apiRateLimitTs(a.rateLimit),
    );
  }

  // ── Worker app (optional) ───────────────────────────────────────────────────
  if (a.includeWorker) {
    const workerApp = path.join(root, "apps", "worker");
    write(path.join(workerApp, "package.json"), workerPackageJson(a));
    write(path.join(workerApp, "tsconfig.json"), appTsconfig());
    write(path.join(workerApp, "tsconfig.build.json"), appTsconfigBuild());
    write(path.join(workerApp, ".env.example"), workerEnvExampleTemplate(a));
    write(path.join(workerApp, "vitest.config.ts"), vitestConfigTs());
    write(path.join(workerApp, "src", "index.ts"), workerIndexTs());
    write(path.join(workerApp, "Dockerfile"), workerDockerfile(a));
  }

  // ── Docker compose ──────────────────────────────────────────────────────────
  const dockerDir = path.join(root, "docker");
  write(path.join(dockerDir, "docker-compose.yml"), dockerComposeTemplate(a));

  if (a.includeObservability) {
    write(
      path.join(dockerDir, "observability", "prometheus.yml"),
      `global:\n  scrape_interval: 15s\n\nscrape_configs:\n  - job_name: "api"\n    static_configs:\n      - targets: ["api:3000"]\n`,
    );
    write(
      path.join(
        dockerDir,
        "observability",
        "grafana",
        "provisioning",
        "datasources",
        "datasources.yaml",
      ),
      grafanaDatasourceYaml(),
    );
  }

  // ── Git init (optional) ─────────────────────────────────────────────────────
  if (a.gitInit) {
    try {
      await runCommand("git", ["init"], root);
      await runCommand("git", ["add", "."], root);
      await runCommand(
        "git",
        ["commit", "-m", "chore: initial scaffold via create-saas-app"],
        root,
      );
    } catch {
      // git errors are non-fatal
    }
  }
}
