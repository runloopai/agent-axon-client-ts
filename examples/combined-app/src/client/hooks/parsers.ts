import type { ToolCallContent } from "@runloop/remote-agents-sdk/acp";
import type { ContentItem } from "../types.js";

export function parseToolCallContent(raw: ToolCallContent[]): ContentItem[] {
  return raw.map((item) => {
    if (item.type === "diff") {
      return {
        type: "diff" as const,
        diff: {
          path: item.path,
          oldText: item.oldText ?? null,
          newText: item.newText,
        },
      };
    }
    if (item.type === "terminal") {
      return {
        type: "terminal" as const,
        terminal: { terminalId: item.terminalId },
      };
    }
    const text = item.content?.type === "text" ? item.content.text : "";
    return {
      type: "content" as const,
      text: text ?? "",
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

export function nextBlockId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function inferToolKind(toolName: string): import("../types.js").ToolKind {
  const name = toolName.toLowerCase();
  if (name.includes("read") || name.includes("glob") || name.includes("grep") || name.includes("search"))
    return "read";
  if (name.includes("edit") || name.includes("write") || name.includes("notebook"))
    return "edit";
  if (name.includes("bash") || name.includes("exec") || name.includes("terminal"))
    return "execute";
  if (name.includes("delete") || name.includes("remove"))
    return "delete";
  if (name.includes("fetch") || name.includes("web"))
    return "fetch";
  if (name.includes("task") || name.includes("agent"))
    return "think";
  return "other";
}
