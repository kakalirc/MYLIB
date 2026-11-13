import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist");
const allowedExtensions = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs",
  ".json", ".webmanifest", ".xml", ".txt",
  ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".otf",
  ".mp4", ".webm", ".mp3", ".wav"
]);
const excludedTopLevel = new Set([
  ".git", ".github", "guides-src", "supabase", "node_modules",
  "dist", "coverage", "scripts"
]);
const excludedNames = new Set([
  "README.md", "BACKEND-CONTRACT.md", "EDGE-FUNCTIONS.md"
]);

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const copied = [];
for (const relative of tracked) {
  const normalized = relative.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (excludedTopLevel.has(segments[0])) continue;
  if (segments.some((part) => part === "tests" || part === "__tests__")) continue;
  if (excludedNames.has(segments.at(-1))) continue;
  if (normalized === "_headers" || normalized === "_redirects") {
    // Cloudflare Workers Static Assets recognizes these deployment metadata files.
  } else if (!allowedExtensions.has(path.extname(normalized).toLowerCase())) {
    continue;
  }
  const source = path.join(root, normalized);
  if (!existsSync(source) || !statSync(source).isFile()) continue;
  const destination = path.join(output, normalized);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination);
  copied.push(normalized);
}

// Generate release metadata at build time so every login displays the actual
// deployment build timestamp, not the visitor's login time.
const releaseInfo = {
  released_by: "Rishin",
  released_at: new Date().toISOString()
};
writeFileSync(
  path.join(output, "release-info.json"),
  JSON.stringify(releaseInfo, null, 2) + "\n",
  "utf8"
);

const required = [
  "index.html",
  "register.html",
  "manifest.json",
  "sw.js",
  "question-bank-host.js",
  "question-bank/question-bank.html",
  "question-bank/question-bank.css",
  "question-bank/question-bank.js",
  "release-info.json"
];
const missing = required.filter((file) => !existsSync(path.join(output, file)));
if (missing.length) {
  throw new Error("Required production assets missing from dist: " + missing.join(", "));
}

const forbidden = [];
function walk(directory, prefix = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name);
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, rel);
    else if (/\.(sql|ts|py|md)$/i.test(entry.name)) forbidden.push(rel);
  }
}
walk(output);
if (forbidden.length) {
  throw new Error("Non-runtime source files leaked into dist: " + forbidden.join(", "));
}

console.log(`Prepared ${copied.length} tracked static assets in dist/.`);
console.log(`Total bytes: ${copied.reduce((sum, file) => sum + statSync(path.join(output, file)).size, 0)}`);
console.log(`Release metadata: ${releaseInfo.released_by} at ${releaseInfo.released_at}`);
console.log("Required app entrypoints and Question Bank shell are present.");
