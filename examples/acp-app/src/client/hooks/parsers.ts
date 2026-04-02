import type { ContentItem } from "./types.js";

export function parseToolCallContent(raw: unknown[]): ContentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry: unknown) => {
    const item = entry as Record<string, unknown>;
    if (item.type === "diff") {
      return {
        type: "diff" as const,
        diff: {
          path: (item.path as string) ?? "",
          oldText: (item.oldText as string | null) ?? null,
          newText: (item.newText as string) ?? "",
        },
      };
    }
    if (item.type === "terminal") {
      return {
        type: "terminal" as const,
        terminal: { terminalId: (item.terminalId as string) ?? "" },
      };
    }
    const content = item.content as { type?: string; text?: string } | undefined;
    return {
      type: "content" as const,
      text: content?.text ?? "",
    };
  });
}

export function extractOutputText(contentItems: ContentItem[], rawOutput: unknown): string | undefined {
  const texts = contentItems
    .filter((c) => c.type === "content" && c.text)
    .map((c) => c.text!);
  if (texts.length > 0) return texts.join("\n");
  if (rawOutput && typeof rawOutput === "object") {
    const ro = rawOutput as Record<string, unknown>;
    return (ro.stdout as string) ?? (ro.error as string) ?? (ro.output as string) ?? undefined;
  }
  return undefined;
}

let blockIdCounter = 0;
export function nextBlockId(prefix: string): string {
  return `${prefix}-${++blockIdCounter}`;
}
