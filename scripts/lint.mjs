import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".next", "node_modules"]);
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const forbiddenPatterns = [
  { pattern: /@ts-(?:ignore|nocheck)\b/, message: "TypeScript suppression is not allowed" },
  { pattern: /dangerouslySetInnerHTML\s*=/, message: "Unreviewed raw HTML rendering is not allowed" },
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }

  return files;
}

const violations = [];
for (const file of await sourceFiles(root)) {
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(line)) {
        violations.push(`${relative(root, file)}:${index + 1} ${rule.message}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Static policy checks passed with zero warnings.");
}
