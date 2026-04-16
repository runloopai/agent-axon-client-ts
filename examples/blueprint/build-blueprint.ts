/**
 * Build the shared agent blueprint for all examples.
 *
 * Usage:
 *   bun run build-blueprint.ts
 *
 * Environment:
 *   RUNLOOP_API_KEY - Required Runloop API key
 *   RUNLOOP_BASE_URL - Optional API base URL override
 */

import { RunloopSDK } from "@runloop/api-client";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const BLUEPRINT_NAME = "axon-agents";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const apiKey = process.env.RUNLOOP_API_KEY;
  if (!apiKey) {
    console.error("RUNLOOP_API_KEY not set");
    process.exit(1);
  }

  const baseUrl = process.env.RUNLOOP_BASE_URL;
  const sdk = new RunloopSDK({
    bearerToken: apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  const dockerfilePath = join(__dirname, "Dockerfile");
  const dockerfile = readFileSync(dockerfilePath, "utf-8");

  console.log(`Building blueprint "${BLUEPRINT_NAME}"...`);
  console.log("Dockerfile contents:");
  console.log("---");
  console.log(dockerfile);
  console.log("---");

  const blueprint = await sdk.blueprint.create({
    name: BLUEPRINT_NAME,
    dockerfile,
  });

  console.log(`Blueprint created: ${blueprint.id}`);

  // Get the final status
  const info = await blueprint.getInfo();
  console.log(`Name: ${info.name}`);
  console.log(`Status: ${info.status}`);

  if (info.status === "build_complete") {
    console.log("\nBlueprint build complete.");
    console.log(`Use blueprint_name: "${BLUEPRINT_NAME}" in devbox.create()`);
  } else {
    console.error(`\nUnexpected blueprint status: ${info.status}`);
    const logs = await blueprint.logs();
    if (logs.logs.length > 0) {
      console.error("Build logs:");
      for (const entry of logs.logs) {
        console.error(`[${entry.level}] ${entry.message}`);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
