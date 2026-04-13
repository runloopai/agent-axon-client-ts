import type { UseCase } from "../types.js";
import elicitation from "./elicitation.js";
import singlePrompt from "./single-prompt.js";

export const USE_CASES: UseCase[] = [
  elicitation,
  singlePrompt,
];
