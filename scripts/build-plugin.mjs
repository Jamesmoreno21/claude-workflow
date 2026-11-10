// Assembles the installable Claude Code plugin in dist/plugin:
// the static files in plugin/, the server and Stop hook bundled into single
// files (no node_modules needed), and the built UI.
// Usage: npm run build:plugin   (expects `npm run build -w web` first)
import { build } from "esbuild";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "plugin");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (!existsSync(join(root, "web", "dist", "index.html"))) {
  console.error("web/dist is missing; run `npm run build -w web` first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(join(root, "plugin"), out, { recursive: true });
cpSync(join(root, "web", "dist"), join(out, "web"), { recursive: true });
cpSync(join(root, "LICENSE"), join(out, "LICENSE"));

await build({
  entryPoints: {
    mcp: join(root, "server", "src", "index.ts"),
    "stop-hook": join(root, "server", "src", "hooks", "stop.ts"),
  },
  outdir: join(out, "server"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Some dependencies are CommonJS and call require().
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "warning",
});

// Stamp the release version into the manifest and the server's environment.
const stamp = (file, update) => {
  const path = join(out, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  update(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
};
stamp(".claude-plugin/plugin.json", (manifest) => (manifest.version = version));
stamp(".mcp.json", (config) => (config.mcpServers.workflow.env.WORKFLOW_VERSION = version));

console.log(`✓ Plugin ${version} built in dist/plugin`);
