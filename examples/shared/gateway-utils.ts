/**
 * Shared utilities for Agent Gateway setup and teardown.
 *
 * Agent Gateway allows agents to call LLM APIs without exposing real API keys.
 * The gateway proxies requests and injects credentials server-side.
 */

import type { RunloopSDK } from "@runloop/api-client";

export interface GatewaySetupResult {
  /**
   * Gateway configuration to pass to devbox.create({ gateways: ... })
   */
  gateways: Record<string, { gateway: string; secret: string }>;

  /**
   * Cleanup function to call on shutdown. Deletes the secret and gateway config created for this run.
   */
  cleanup: () => Promise<void>;
}

/**
 * Generate a unique resource name for this run.
 * Format: AXON_EXAMPLE_{PROVIDER}_{YYYYMMDD}_{random}
 */
function generateResourceName(provider: string): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `AXON_EXAMPLE_${provider.toUpperCase()}_${dateStr}_${randomSuffix}`;
}

export interface SetupAnthropicGatewayOptions {
  /**
   * Override the API key instead of reading from ANTHROPIC_API_KEY env var.
   */
  apiKey?: string;

  /**
   * If true, don't throw when ANTHROPIC_API_KEY is missing - return null instead.
   * Useful for optional Anthropic support.
   */
  optional?: boolean;
}

/**
 * Set up Agent Gateway for Anthropic API access.
 *
 * This function:
 * 1. Reads ANTHROPIC_API_KEY from env (or uses provided apiKey)
 * 2. Creates a unique secret for this run
 * 3. Creates a unique gateway config for this run
 * 4. Returns gateway config and cleanup function
 *
 * The devbox will receive $ANTHROPIC_URL and $ANTHROPIC environment variables
 * instead of the real API key.
 *
 * @example
 * ```typescript
 * const sdk = new RunloopSDK({ bearerToken: apiKey });
 * const gateway = await setupAnthropicGateway(sdk);
 *
 * const devbox = await sdk.devbox.create({
 *   gateways: gateway.gateways,
 *   // ... other options
 * });
 *
 * // On shutdown:
 * await gateway.cleanup();
 * ```
 */
export async function setupAnthropicGateway(
  sdk: RunloopSDK,
  options: SetupAnthropicGatewayOptions = {},
): Promise<GatewaySetupResult | null> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    if (options.optional) {
      return null;
    }
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for Agent Gateway setup. " +
        "Set it in your environment or .env file.",
    );
  }

  const resourceName = generateResourceName("ANTHROPIC");

  await sdk.secret.create({
    name: resourceName,
    value: apiKey,
  });

  const gateway = await sdk.gatewayConfig.create({
    name: resourceName,
    endpoint: "https://api.anthropic.com",
    auth_mechanism: { type: "bearer" },
    description: "Temporary gateway for example run",
  });

  const cleanup = async () => {
    try {
      await sdk.secret.delete(resourceName);
    } catch (err) {
      console.warn(`[gateway-utils] Failed to delete secret ${resourceName}:`, err);
    }
    try {
      await gateway.delete();
    } catch (err) {
      console.warn(`[gateway-utils] Failed to delete gateway config ${resourceName}:`, err);
    }
  };

  return {
    gateways: {
      ANTHROPIC: {
        gateway: gateway.id,
        secret: resourceName,
      },
    },
    cleanup,
  };
}

/**
 * Set up Agent Gateway for OpenAI API access.
 *
 * Similar to setupAnthropicGateway but for OpenAI.
 * The devbox will receive $OPENAI_URL and $OPENAI environment variables.
 */
export async function setupOpenAIGateway(
  sdk: RunloopSDK,
  options: { apiKey?: string; optional?: boolean } = {},
): Promise<GatewaySetupResult | null> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (options.optional) {
      return null;
    }
    throw new Error(
      "OPENAI_API_KEY environment variable is required for Agent Gateway setup.",
    );
  }

  const resourceName = generateResourceName("OPENAI");

  await sdk.secret.create({
    name: resourceName,
    value: apiKey,
  });

  const gateway = await sdk.gatewayConfig.create({
    name: resourceName,
    endpoint: "https://api.openai.com",
    auth_mechanism: { type: "bearer" },
    description: "Temporary gateway for example run",
  });

  const cleanup = async () => {
    try {
      await sdk.secret.delete(resourceName);
    } catch (err) {
      console.warn(`[gateway-utils] Failed to delete secret ${resourceName}:`, err);
    }
    try {
      await gateway.delete();
    } catch (err) {
      console.warn(`[gateway-utils] Failed to delete gateway config ${resourceName}:`, err);
    }
  };

  return {
    gateways: {
      OPENAI: {
        gateway: gateway.id,
        secret: resourceName,
      },
    },
    cleanup,
  };
}

/**
 * Merge multiple gateway setup results into one.
 * Useful when setting up multiple gateways (e.g., both Anthropic and OpenAI).
 */
export function mergeGatewayResults(
  ...results: (GatewaySetupResult | null)[]
): GatewaySetupResult {
  const validResults = results.filter((r): r is GatewaySetupResult => r !== null);

  const gateways: Record<string, { gateway: string; secret: string }> = {};
  for (const result of validResults) {
    Object.assign(gateways, result.gateways);
  }

  const cleanup = async () => {
    await Promise.all(validResults.map((r) => r.cleanup()));
  };

  return { gateways, cleanup };
}
