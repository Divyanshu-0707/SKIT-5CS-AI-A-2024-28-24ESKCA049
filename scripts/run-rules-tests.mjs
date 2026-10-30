import { spawn, spawnSync, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const host = "127.0.0.1";
const port = 8180;
const projectId = "demo-decision-board";

function listeningPid() {
  if (process.platform !== "win32") return null;
  const output = execFileSync("netstat.exe", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
  });
  const pattern = new RegExp(
    `^\\s*TCP\\s+${host.replaceAll(".", "\\.")}:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
    "mi",
  );
  const match = output.match(pattern);
  return match ? Number(match[1]) : null;
}

async function waitForEmulator(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const pid = listeningPid();
    if (pid) return pid;
    if (child.exitCode && child.exitCode !== 0) {
      throw new Error(
        `Firebase Emulator Suite exited with code ${child.exitCode}.`,
      );
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Firestore Emulator did not open ${host}:${port}.`);
}

const existingPid = listeningPid();
if (existingPid) {
  throw new Error(
    `Port ${port} is already used by PID ${existingPid}. Stop that process and retry.`,
  );
}

const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) {
  throw new Error("Run this verification through npm.");
}
const npxCli = resolve(dirname(npmExecutable), "npx-cli.js");
const emulator = spawn(
  process.execPath,
  [
    npxCli,
    "--yes",
    "firebase-tools@15.24.0",
    "emulators:start",
    "--project",
    projectId,
    "--only",
    "firestore",
  ],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  },
);

let emulatorPid;
let testStatus = 1;
try {
  emulatorPid = await waitForEmulator(emulator);
  const result = spawnSync(
    process.execPath,
    ["--test", "tests/firebase-rules.test.mjs"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: `${host}:${port}`,
        GCLOUD_PROJECT: projectId,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  testStatus = result.status ?? 1;
} finally {
  if (emulator.exitCode === null) {
    try {
      emulator.kill("SIGINT");
    } catch {
      // Fall through to the verified Java-child cleanup below.
    }
  }
  for (let attempt = 0; attempt < 20 && listeningPid(); attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (emulatorPid && listeningPid() === emulatorPid) {
    try {
      process.kill(emulatorPid);
    } catch {
      // The Firebase CLI may already have stopped its Java child.
    }
  }
  rmSync(resolve(process.cwd(), "firestore-debug.log"), { force: true });
}

process.exit(testStatus);
