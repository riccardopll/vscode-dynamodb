import path from "node:path";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const esbuildBinary = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "esbuild.cmd" : "esbuild",
);

const args = [
  "src/extension.ts",
  "--bundle",
  "--format=cjs",
  "--platform=node",
  "--target=node20",
  "--external:vscode",
  "--sourcemap",
  "--outfile=dist/extension.js",
];

if (process.argv.includes("--watch")) {
  args.push("--watch");
} else {
  rmSync("dist", { recursive: true, force: true });
}

const result = spawnSync(esbuildBinary, args, {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
