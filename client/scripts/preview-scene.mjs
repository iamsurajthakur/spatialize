// Replay saved geometry through the real React/Three viewer, without an API call.
// Usage: node scripts/preview-scene.mjs scene.json source.jpg [port]
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, globSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const [scenePath, imagePath, port = "3099"] = process.argv.slice(2);
if (!scenePath || !imagePath) throw new Error("Usage: node scripts/preview-scene.mjs scene.json source.jpg [port]");
const client = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = mkdtempSync(join(tmpdir(), "spatialize-preview-"));
execFileSync("bun", ["build", "scripts/preview-scene.tsx", "--target=browser", `--outfile=${join(output, "viewer.js")}`], { cwd: client, stdio: "inherit" });
const styles = globSync(".next/static/**/*.css", { cwd: client }).map((path) => readFileSync(join(client, path), "utf8")).join("\n");
if (!styles) throw new Error("Run a Next.js production build first to generate viewer styles");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0} ${styles}</style></head><body><div id="root"></div><script type="module" src="/viewer.js"></script></body></html>`;
const routes = {
  "/": () => ["text/html", html],
  "/viewer.js": () => ["text/javascript", readFileSync(join(output, "viewer.js"))],
  "/scene.json": () => ["application/json", readFileSync(resolve(scenePath))],
  "/source-image": () => ["application/octet-stream", readFileSync(resolve(imagePath))],
};
createServer((request, response) => {
  const route = routes[new URL(request.url, "http://localhost").pathname];
  if (!route) { response.writeHead(404).end(); return; }
  const [type, body] = route();
  response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(body);
}).listen(Number(port), "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${port}`));
