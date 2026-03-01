#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { runPrompts } from "./prompts.js";
import { generateProject } from "./generator.js";

async function main() {
  console.log();
  p.intro(
    `${pc.bgCyan(pc.black(" create-saas-app "))} ${pc.dim("Multi-Tenant SaaS Boilerplate")}`,
  );

  const projectName = process.argv[2];

  const answers = await runPrompts(projectName);

  if (p.isCancel(answers)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
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

  p.outro(
    `${pc.green("✔")} Done! Run the following to get started:\n\n  ${pc.cyan(`cd ${answers.projectName}`)}\n  ${pc.cyan(`${answers.packageManager} install`)}\n  ${pc.cyan(`${answers.packageManager} run dev`)}\n`,
  );
}

main().catch(console.error);
