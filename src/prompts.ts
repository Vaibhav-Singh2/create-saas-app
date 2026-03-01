import * as p from "@clack/prompts";

export type DatabaseChoice =
  | "postgres-drizzle"
  | "postgres-prisma"
  | "mongodb-mongoose"
  | "sqlite-drizzle";

export type RateLimitChoice = "none" | "memory" | "redis";

export type PackageManager = "bun" | "pnpm" | "npm";

export interface ProjectAnswers {
  projectName: string;
  packageManager: PackageManager;
  database: DatabaseChoice;
  includeWorker: boolean;
  includeObservability: boolean;
  includeAuth: boolean;
  includeQueue: boolean;
  rateLimit: RateLimitChoice;
  gitInit: boolean;
}

export async function runPrompts(
  nameArg?: string,
): Promise<ProjectAnswers | symbol> {
  const group = await p.group(
    {
      projectName: () =>
        p.text({
          message: "What is your project name?",
          placeholder: "my-saas-app",
          defaultValue: nameArg ?? "my-saas-app",
          validate: (v) => {
            if (!v) return "Project name is required";
            if (!/^[a-z0-9-_]+$/i.test(v))
              return "Only letters, numbers, dashes and underscores are allowed";
          },
        }),

      packageManager: () =>
        p.select<PackageManager>({
          message: "Which package manager do you prefer?",
          options: [
            { value: "bun", label: "bun", hint: "fastest" },
            { value: "pnpm", label: "pnpm", hint: "efficient" },
            { value: "npm", label: "npm", hint: "classic" },
          ],
        }),

      database: () =>
        p.select<DatabaseChoice>({
          message: "Which database / ORM?",
          options: [
            {
              value: "postgres-drizzle",
              label: "PostgreSQL + Drizzle ORM",
              hint: "type-safe SQL",
            },
            {
              value: "postgres-prisma",
              label: "PostgreSQL + Prisma",
              hint: "schema-first",
            },
            {
              value: "mongodb-mongoose",
              label: "MongoDB + Mongoose",
              hint: "document model",
            },
            {
              value: "sqlite-drizzle",
              label: "SQLite + Drizzle ORM",
              hint: "zero-infra",
            },
          ],
        }),

      includeWorker: () =>
        p.confirm({
          message:
            "Include a background worker app? (long-running process + BullMQ ready)",
          initialValue: true,
        }),

      includeObservability: () =>
        p.confirm({
          message:
            "Include observability stack? (Prometheus + Loki + Grafana via Docker)",
          initialValue: false,
        }),

      includeAuth: () =>
        p.confirm({
          message: "Include auth package? (JWT-based)",
          initialValue: true,
        }),

      includeQueue: () =>
        p.confirm({
          message: "Include queue package? (BullMQ + Redis)",
          initialValue: true,
        }),

      rateLimit: () =>
        p.select<RateLimitChoice>({
          message: "Rate limiting strategy?",
          options: [
            { value: "none", label: "None", hint: "skip rate limiting" },
            {
              value: "memory",
              label: "In-memory",
              hint: "express-rate-limit (single node)",
            },
            {
              value: "redis",
              label: "Redis-backed",
              hint: "rate-limit-redis (distributed)",
            },
          ],
        }),

      gitInit: () =>
        p.confirm({
          message: "Initialize a git repository?",
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    },
  );

  return group as ProjectAnswers;
}
