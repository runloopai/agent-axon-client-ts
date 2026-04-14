import type { ContentBlock } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  isAudioContent,
  isEmbeddedResourceContent,
  isImageContent,
  isResourceLinkContent,
  isTextContent,
} from "./content-block-guards.js";

const guards = [
  { fn: isTextContent, type: "text" },
  { fn: isImageContent, type: "image" },
  { fn: isAudioContent, type: "audio" },
  { fn: isResourceLinkContent, type: "resource_link" },
  { fn: isEmbeddedResourceContent, type: "resource" },
] as const;

const makeBlock = (type: string): ContentBlock => {
  switch (type) {
    case "text":
      return { type: "text", text: "hello" };
    case "image":
      return { type: "image", data: "base64data", mimeType: "image/png" };
    case "audio":
      return { type: "audio", data: "base64audio", mimeType: "audio/wav" };
    case "resource_link":
      return { type: "resource_link", uri: "file:///path", name: "file.txt" };
    case "resource":
      return {
        type: "resource",
        resource: { uri: "file:///path", text: "content" },
      };
    default:
      throw new Error(`Unknown type: ${type}`);
  }
};

describe("content-block-guards", () => {
  for (const { fn, type } of guards) {
    describe(fn.name, () => {
      it(`returns true for type="${type}"`, () => {
        const block = makeBlock(type);
        expect(fn(block)).toBe(true);
      });

      it("returns false for non-matching content types", () => {
        for (const other of guards) {
          if (other.type === type) continue;
          const block = makeBlock(other.type);
          expect(fn(block)).toBe(false);
        }
      });
    });
  }
});
