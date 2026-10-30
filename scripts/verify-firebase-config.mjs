import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";

const root = process.cwd();
const environment = loadEnv("production", root, "");
const requiredNames = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const errors = [];

if (environment.VITE_APP_MODE !== "firebase") {
  errors.push("VITE_APP_MODE must be firebase.");
}

for (const name of requiredNames) {
  const value = environment[name]?.trim();
  if (!value || /replace|example|your[-_ ]/i.test(value)) {
    errors.push(`${name} is missing or still contains a placeholder.`);
  }
}

if (environment.VITE_USE_FIREBASE_EMULATORS === "true") {
  errors.push("VITE_USE_FIREBASE_EMULATORS must be false for deployment.");
}

const geminiProxyUrl = environment.VITE_GEMINI_PROXY_URL?.trim() || "";
if (
  geminiProxyUrl &&
  !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9._~!$&'()*+,;=:@%/-]*)?$/i.test(
    geminiProxyUrl,
  )
) {
  errors.push("VITE_GEMINI_PROXY_URL must be an HTTPS URL.");
}

const projectId = environment.VITE_FIREBASE_PROJECT_ID?.trim();
if (projectId && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
  errors.push("VITE_FIREBASE_PROJECT_ID is not a valid Firebase project ID.");
}

const projectFile = resolve(root, ".firebaserc");
if (!existsSync(projectFile)) {
  errors.push(".firebaserc is missing. Run firebase use --add first.");
} else {
  try {
    const projectAliases = JSON.parse(readFileSync(projectFile, "utf8")).projects;
    if (!projectAliases?.default) {
      errors.push('.firebaserc must contain a "default" project alias.');
    } else if (projectId && projectAliases.default !== projectId) {
      errors.push(
        `.firebaserc points to ${projectAliases.default}, but the web config uses ${projectId}.`,
      );
    }
  } catch {
    errors.push(".firebaserc is not valid JSON.");
  }
}

if (errors.length > 0) {
  console.error(
    [
      "Firebase deployment preflight failed:",
      ...errors.map((error) => `- ${error}`),
      "",
      "Follow FIREBASE_SETUP.md, then run npm run deploy:check again.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!geminiProxyUrl) {
  console.warn(
    "Gemini proxy is not connected. Built-in board plans remain available.",
  );
}

console.log(`Firebase deployment configuration is ready for ${projectId}.`);
