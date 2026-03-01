#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPrompts } from "./prompts.js";
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

  if (!p.isCancel(runInstall) && runInstall) {
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

  const devCmd = pm === "bun" ? "bun dev" : `${pm} run dev`;
  const cdCmd = `cd ${answers.projectName}`;
  const installCmd = `${pm} install`;

  p.outro(
    `${pc.green("✔")} Done! Next steps:\n\n  ${pc.cyan(cdCmd)}\n${runInstall ? "" : `  ${pc.cyan(installCmd)}\n`}  ${pc.dim("# Start infrastructure")}\n  ${pc.cyan("docker compose -f docker/docker-compose.yml up -d")}\n  ${pc.dim("# Copy env vars")}\n  ${pc.cyan("cp apps/api/.env.example apps/api/.env")}\n  ${pc.dim("# Start dev")}\n  ${pc.cyan(devCmd)}\n`,
  );
}

main().catch(console.error);
