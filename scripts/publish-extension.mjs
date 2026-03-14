import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);

loadEnvFile(join(rootDir, ".env"));

const vsceToken = process.env.VSCE_PAT;
const ovsxToken = process.env.OVSX_PAT;
const vsixPath = join(
  rootDir,
  `${packageJson.name}-${packageJson.version}.vsix`,
);

assertToken(vsceToken, "VSCE_PAT");
assertToken(ovsxToken, "OVSX_PAT");

run("npm", ["run", "build"]);
runBinary("vsce", ["package", "--no-dependencies", "--out", vsixPath]);

runBinary("vsce", [
  "publish",
  "--packagePath",
  vsixPath,
  "--skip-duplicate",
  "-p",
  vsceToken,
]);
runBinary("ovsx", [
  "publish",
  "--packagePath",
  vsixPath,
  "--skip-duplicate",
  "-p",
  ovsxToken,
]);

function assertToken(token, variableName) {
  if (!token) {
    throw new Error(
      `Missing ${variableName} in the environment or ${join(rootDir, ".env")}`,
    );
  }
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runBinary(binaryName, args) {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  run(join(rootDir, "node_modules", ".bin", `${binaryName}${suffix}`), args);
}
