#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPrompts } from "./prompts.js";
import type { ProjectAnswers } from "./prompts.js";
import { generateProject, projectDirectoryExists } from "./generator.js";
import { execa } from "execa";

// ─── Resolve package version ─────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
) as { version: string };
const VERSION = pkgJson.version;

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function buildNextSteps(answers: ProjectAnswers, didInstall: boolean): string {
  const pm = answers.packageManager;
  const devCmd = pm === "bun" ? "bun dev" : `${pm} run dev`;
  const dbMigrateCmd = `${pm} run db:migrate`;

  const lines: string[] = [
    `${pc.green("✔")} Done! Next steps:`,
    "",
    `  ${pc.cyan(`cd ${answers.projectName}`)}`,
  ];

  if (!didInstall) {
    lines.push(`  ${pc.cyan(`${pm} install`)}`);
  }

  lines.push(
    `  ${pc.dim("# Start infrastructure")}`,
    `  ${pc.cyan("docker compose -f docker/docker-compose.yml up -d")}`,
    `  ${pc.dim("# Copy env files")}`,
    `  ${pc.cyan("cp apps/api/.env.example apps/api/.env")}`,
  );

  if (answers.includeWorker) {
    lines.push(`  ${pc.cyan("cp apps/worker/.env.example apps/worker/.env")}`);
  }

  if (answers.includeWeb) {
    lines.push(`  ${pc.cyan("cp apps/web/.env.example apps/web/.env.local")}`);
  }

  lines.push(
    `  ${pc.dim("# Windows (PowerShell) copy alternative")}`,
    `  ${pc.cyan('Copy-Item "apps/api/.env.example" "apps/api/.env"')}`,
  );

  if (answers.includeWorker) {
    lines.push(
      `  ${pc.cyan('Copy-Item "apps/worker/.env.example" "apps/worker/.env"')}`,
    );
  }

  if (answers.includeWeb) {
    lines.push(
      `  ${pc.cyan('Copy-Item "apps/web/.env.example" "apps/web/.env.local"')}`,
    );
  }

  if (answers.database !== "mongodb-mongoose") {
    lines.push(
      `  ${pc.dim("# Run database migrations")}`,
      `  ${pc.cyan(dbMigrateCmd)}`,
    );
  }

  lines.push(`  ${pc.dim("# Start dev")}`, `  ${pc.cyan(devCmd)}`, "");

  return lines.join("\n");
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(`create-saas-app v${VERSION}`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
${pc.bold("create-saas-app")} v${VERSION}

${pc.dim("Scaffold a production-ready Multi-Tenant SaaS Turborepo monorepo.")}

${pc.bold("Usage:")}
  npx create-saas-app [project-name] [options]

${pc.bold("Options:")}
  --help,    -h   Show this help message
  --version, -v   Show version number

${pc.bold("Examples:")}
  npx create-saas-app
  npx create-saas-app my-startup
`);
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log();
  p.intro(
    `${pc.bgCyan(pc.black(" create-saas-app "))} ${pc.dim(`v${VERSION} · Multi-Tenant SaaS Boilerplate`)}`,
  );

  const projectName = args.find((a) => !a.startsWith("-"));

  const answers = await runPrompts(projectName);

  if (p.isCancel(answers)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // ── Directory conflict guard ─────────────────────────────────────────────────
  if (projectDirectoryExists(answers.projectName)) {
    const overwrite = await p.confirm({
      message: `Directory ${pc.yellow(answers.projectName)} already exists. Overwrite?`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Aborted.");
      process.exit(0);
    }
  }

  const spinner = p.spinner();
  spinner.start("Scaffolding your project...");

  try {
    await generateProject(answers);
    spinner.stop("Project scaffolded successfully!");
  } catch (err) {
    spinner.stop("Failed to scaffold project.");
    console.error(err);
    process.exit(1);
  }

  // ── Offer to install dependencies ────────────────────────────────────────────
  const pm = answers.packageManager;
  const runInstall = await p.confirm({
    message: `Run ${pc.cyan(`${pm} install`)} now?`,
    initialValue: true,
  });
  const didInstall = !p.isCancel(runInstall) && runInstall;

  if (didInstall) {
    const installSpinner = p.spinner();
    installSpinner.start(`Installing dependencies with ${pm}...`);
    try {
      await execa(pm, ["install"], {
        cwd: answers.projectName,
        stdio: "pipe",
      });
      installSpinner.stop("Dependencies installed!");
    } catch {
      installSpinner.stop(
        pc.yellow("Install failed — run it manually after reviewing the logs."),
      );
    }
  }

  p.outro(buildNextSteps(answers, didInstall));
}

main().catch(console.error);
