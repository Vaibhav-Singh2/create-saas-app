import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";

export function mkdirp(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function write(filePath: string, content: string) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

export async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<void> {
  await execa(cmd, args, { cwd, stdio: "pipe" });
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
