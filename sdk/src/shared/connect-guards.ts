import type { Axon } from "@runloop/api-client/sdk";
import { getLastSequence } from "./replay.js";
import type { BaseConnectionOptions } from "./types.js";

/**
 * Validates replay/afterSequence options and resolves the replay target
 * sequence number. Shared by both ACP and Claude connection classes.
 *
 * @returns The replay target sequence, or `undefined` if replay is disabled.
 * @throws If both `replay` and `afterSequence` are set (mutually exclusive).
 */
export async function resolveReplayTarget(
  axon: Axon,
  options: Pick<BaseConnectionOptions, "replay" | "afterSequence">,
  log: (tag: string, ...args: unknown[]) => void,
): Promise<number | undefined> {
  const replay = options.replay ?? true;
  if (replay && options.afterSequence != null) {
    throw new Error("Cannot use both 'replay' and 'afterSequence'. They are mutually exclusive.");
  }
  if (!replay) return undefined;
  const seq = await getLastSequence(axon);
  if (seq != null) {
    log("connect", `replay target sequence: ${seq}`);
  }
  return seq;
}
