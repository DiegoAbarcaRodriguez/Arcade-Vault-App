#!/usr/bin/env node
// PostToolUse hook (Write|Edit): auto-fixes lint issues and formats the
// touched file with ESLint + Prettier so code stays consistent.
//
// Reads the hook payload (JSON) from stdin, pulls the edited file path out
// of tool_input, and runs `eslint --fix` then `prettier --write` on it.
// Silently no-ops for files neither tool understands, and never blocks the
// edit — failures are reported via systemMessage but exit 0.

import { existsSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const ESLINT_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const PRETTIER_EXTS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".html",
]);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }

  const filePath =
    payload?.tool_input?.file_path ?? payload?.tool_response?.filePath;

  if (!filePath || !existsSync(filePath)) process.exit(0);

  const ext = extname(filePath).toLowerCase();
  const messages = [];

  const useShell = process.platform === "win32";
  // On Windows, spawnSync(..., { shell: true }) concatenates command + args
  // into a single string for cmd.exe without quoting them itself, so any
  // argument containing a space (e.g. a path under "Diego Abarca") gets
  // split apart. Quote manually to keep each argument intact.
  const quote = (arg) => (useShell && /\s/.test(arg) ? `"${arg}"` : arg);

  const run = (label, cmd, args) => {
    const result = spawnSync(cmd, args.map(quote), {
      shell: useShell,
      encoding: "utf8",
    });
    if (result.error || (result.status !== 0 && result.status !== null)) {
      const detail = (result.stderr || result.stdout || result.error?.message || "")
        .trim()
        .split("\n")
        .slice(0, 5)
        .join("\n");
      if (detail) messages.push(`${label}: ${detail}`);
    }
  };

  if (ESLINT_EXTS.has(ext)) {
    run("ESLint", "npx", ["--no-install", "eslint", "--fix", filePath]);
  }
  if (PRETTIER_EXTS.has(ext)) {
    run("Prettier", "npx", ["--no-install", "prettier", "--write", filePath]);
  }

  if (messages.length > 0) {
    console.log(
      JSON.stringify({
        systemMessage: `Lint/format on ${filePath}:\n${messages.join("\n")}`,
      }),
    );
  }
  process.exit(0);
});
