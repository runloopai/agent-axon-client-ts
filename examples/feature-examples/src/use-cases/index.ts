import type { UseCase } from "../types.js";
import elicitationAcp from "./elicitation-acp.js";
import elicitationClaude from "./elicitation-claude.js";
import singlePrompt from "./single-prompt.js";

export const USE_CASES: UseCase[] = [
  elicitationAcp,
  elicitationClaude,
  singlePrompt,
];
