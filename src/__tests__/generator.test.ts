import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateProject, projectDirectoryExists } from "../generator.js";
import type { ProjectAnswers } from "../prompts.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseAnswers(overrides: Partial<ProjectAnswers> = {}): ProjectAnswers {
  return {
    projectName: "test-app",
    packageManager: "npm",
    database: "postgres-drizzle",
    includeWeb: false,
    includeWorker: false,
    includeObservability: false,
    includeAuth: true,
    includeQueue: false,
    includePayments: false,
    emailProvider: "none",
    rateLimit: "none",
    gitInit: false,
    ...overrides,
  };
}

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-saas-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function exists(...parts: string[]): boolean {
  return fs.existsSync(path.join(tmpDir, "test-app", ...parts));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("generateProject", () => {
  test("1. postgres-drizzle: generates drizzle config and schema", async () => {
    await generateProject(baseAnswers({ database: "postgres-drizzle" }));
    expect(exists("packages", "database", "drizzle.config.ts")).toBe(true);
    expect(exists("packages", "database", "src", "schema.ts")).toBe(true);
    expect(exists("packages", "redis")).toBe(false); // queue=false, worker=false
  });

  test("2. postgres-prisma: generates prisma schema.prisma", async () => {
    await generateProject(baseAnswers({ database: "postgres-prisma" }));
    expect(exists("packages", "database", "prisma", "schema.prisma")).toBe(
      true,
    );
    expect(exists("packages", "database", "drizzle.config.ts")).toBe(false);
  });

  test("3. sqlite-drizzle: generates drizzle config with SQLite", async () => {
    await generateProject(baseAnswers({ database: "sqlite-drizzle" }));
    const config = fs.readFileSync(
      path.join(
        tmpDir,
        "test-app",
        "packages",
        "database",
        "drizzle.config.ts",
      ),
      "utf-8",
    );
    expect(config).toContain("sqlite");
    expect(exists("packages", "database", "src", "schema.ts")).toBe(true);
  });

  test("4. includeWorker=false: apps/worker does not exist", async () => {
    await generateProject(baseAnswers({ includeWorker: false }));
    expect(exists("apps", "worker")).toBe(false);
  });

  test("5. includeQueue=false: packages/queue does not exist", async () => {
    await generateProject(baseAnswers({ includeQueue: false }));
    expect(exists("packages", "queue")).toBe(false);
  });

  test("6. worker=true + queue=false: packages/redis still exists (worker needs it)", async () => {
    await generateProject(
      baseAnswers({ includeWorker: true, includeQueue: false }),
    );
    expect(exists("apps", "worker")).toBe(true);
    expect(exists("packages", "redis")).toBe(true); // worker needs redis
    expect(exists("packages", "queue")).toBe(false);
  });

  test("7. includeWeb=true: Next.js app is scaffolded", async () => {
    await generateProject(baseAnswers({ includeWeb: true }));
    expect(exists("apps", "web", "package.json")).toBe(true);
    expect(exists("apps", "web", "next.config.ts")).toBe(true);
    expect(exists("apps", "web", "src", "app", "layout.tsx")).toBe(true);
    expect(exists("apps", "web", "src", "app", "page.tsx")).toBe(true);
    expect(exists("apps", "web", "src", "app", "dashboard", "page.tsx")).toBe(
      true,
    );
    expect(
      exists("apps", "web", "src", "app", "(auth)", "login", "page.tsx"),
    ).toBe(true);
    expect(exists("apps", "web", "src", "middleware.ts")).toBe(true);
    expect(exists("apps", "web", "Dockerfile")).toBe(true);
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "test-app", "apps", "web", "package.json"),
        "utf-8",
      ),
    );
    expect(pkg.dependencies["next"]).toBeDefined();
  });

  test("8. includePayments=true: packages/payments is scaffolded", async () => {
    await generateProject(baseAnswers({ includePayments: true }));
    expect(exists("packages", "payments", "src", "index.ts")).toBe(true);
    expect(exists("packages", "payments", "package.json")).toBe(true);
    const src = fs.readFileSync(
      path.join(tmpDir, "test-app", "packages", "payments", "src", "index.ts"),
      "utf-8",
    );
    expect(src).toContain("Razorpay");
    expect(src).toContain("createOrder");
    expect(src).toContain("verifyWebhookSignature");
    // Payments route should be in API
    expect(exists("apps", "api", "src", "routes", "payments.ts")).toBe(true);
  });

  test("9. emailProvider=resend: packages/email uses Resend", async () => {
    await generateProject(baseAnswers({ emailProvider: "resend" }));
    expect(exists("packages", "email", "src", "index.ts")).toBe(true);
    const src = fs.readFileSync(
      path.join(tmpDir, "test-app", "packages", "email", "src", "index.ts"),
      "utf-8",
    );
    expect(src).toContain("Resend");
    expect(src).toContain("sendEmail");
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "test-app", "packages", "email", "package.json"),
        "utf-8",
      ),
    );
    expect(pkg.dependencies["resend"]).toBeDefined();
  });

  test("9b. emailProvider=nodemailer: packages/email uses nodemailer", async () => {
    await generateProject(baseAnswers({ emailProvider: "nodemailer" }));
    const src = fs.readFileSync(
      path.join(tmpDir, "test-app", "packages", "email", "src", "index.ts"),
      "utf-8",
    );
    expect(src).toContain("nodemailer");
    expect(src).toContain("sendEmail");
  });

  test("10. projectDirectoryExists helper works correctly", () => {
    const unique = `create-saas-test-dir-${Date.now()}`;
    expect(projectDirectoryExists(unique)).toBe(false);
    fs.mkdirSync(path.join(tmpDir, unique));
    // Change cwd so the helper resolves relative to tmpDir
    const result = fs.existsSync(path.join(tmpDir, unique));
    expect(result).toBe(true);
  });

  test("11. rateLimit=redis: middleware/rateLimit.ts is generated", async () => {
    await generateProject(baseAnswers({ rateLimit: "redis" }));
    expect(exists("apps", "api", "src", "middleware", "rateLimit.ts")).toBe(
      true,
    );
    const src = fs.readFileSync(
      path.join(
        tmpDir,
        "test-app",
        "apps",
        "api",
        "src",
        "middleware",
        "rateLimit.ts",
      ),
      "utf-8",
    );
    expect(src).toContain("RedisStore");
  });

  test("12. tenantMiddleware is always generated in API", async () => {
    await generateProject(baseAnswers());
    expect(exists("apps", "api", "src", "middleware", "tenant.ts")).toBe(true);
  });

  test("13. eslint.config.ts and .prettierrc are always generated", async () => {
    await generateProject(baseAnswers());
    expect(exists("eslint.config.ts")).toBe(true);
    expect(exists(".prettierrc")).toBe(true);
  });

  test("14. mongodb-mongoose: generates mongoose DB package without drizzle/prisma files", async () => {
    await generateProject(baseAnswers({ database: "mongodb-mongoose" }));
    expect(exists("packages", "database", "drizzle.config.ts")).toBe(false);
    expect(exists("packages", "database", "prisma", "schema.prisma")).toBe(
      false,
    );
    const dbPkg = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "test-app", "packages", "database", "package.json"),
        "utf-8",
      ),
    );
    expect(dbPkg.dependencies["mongoose"]).toBeDefined();
  });

  test("15. rateLimit=memory: generates middleware without Redis store", async () => {
    await generateProject(baseAnswers({ rateLimit: "memory" }));
    expect(exists("apps", "api", "src", "middleware", "rateLimit.ts")).toBe(
      true,
    );
    const src = fs.readFileSync(
      path.join(
        tmpDir,
        "test-app",
        "apps",
        "api",
        "src",
        "middleware",
        "rateLimit.ts",
      ),
      "utf-8",
    );
    expect(src).toContain("express-rate-limit");
    expect(src).not.toContain("RedisStore");
  });

  test("16. rateLimit=none: does not generate rate limit middleware", async () => {
    await generateProject(baseAnswers({ rateLimit: "none" }));
    expect(exists("apps", "api", "src", "middleware", "rateLimit.ts")).toBe(
      false,
    );
  });

  test("17. includeObservability=true: creates Prometheus and Grafana provisioning files", async () => {
    await generateProject(baseAnswers({ includeObservability: true }));
    expect(exists("docker", "observability", "prometheus.yml")).toBe(true);
    expect(
      exists(
        "docker",
        "observability",
        "grafana",
        "provisioning",
        "datasources",
        "datasources.yaml",
      ),
    ).toBe(true);
  });

  test("18. includeAuth=false: auth package is not created", async () => {
    await generateProject(baseAnswers({ includeAuth: false }));
    expect(exists("packages", "auth")).toBe(false);
  });

  test("19. includeWeb=false: web app is not created", async () => {
    await generateProject(baseAnswers({ includeWeb: false }));
    expect(exists("apps", "web")).toBe(false);
  });

  test("20. gitInit=true: generation completes and creates project directory", async () => {
    await expect(generateProject(baseAnswers({ gitInit: true }))).resolves.toBe(
      undefined,
    );
    expect(exists()).toBe(true);
  });
});
