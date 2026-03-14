import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const binDir = path.join(cwd, "node_modules", ".bin");

const viteBinary = path.join(
  binDir,
  process.platform === "win32" ? "vite.cmd" : "vite",
);
const tscBinary = path.join(
  binDir,
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);
const codeBinary = process.platform === "win32" ? "code.cmd" : "code";

mkdirSync(`${cwd}/.vscode-dev-user-data`, { recursive: true });
mkdirSync(`${cwd}/.vscode-dev-extensions`, { recursive: true });

const watchCommands = [
  [process.execPath, ["scripts/build-extension.mjs", "--watch"]],
  [viteBinary, ["build", "--watch"]],
  [tscBinary, ["--noEmit", "--watch"]],
];

const children = watchCommands.map(([command, args]) =>
  spawn(command, args, {
    cwd,
    stdio: "inherit",
  }),
);

const codeProcess = spawn(
  codeBinary,
  [
    "--new-window",
    "--user-data-dir",
    `${cwd}/.vscode-dev-user-data`,
    "--extensions-dir",
    `${cwd}/.vscode-dev-extensions`,
    `--extensionDevelopmentPath=${cwd}`,
    cwd,
  ],
  {
    cwd,
    detached: true,
    stdio: "ignore",
  },
);

codeProcess.unref();

let isShuttingDown = false;

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(exitCode);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (isShuttingDown) {
      return;
    }

    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
