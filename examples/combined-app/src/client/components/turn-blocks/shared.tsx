import * as Diff from "diff";
import type { ContentItem, TerminalState } from "../../types.js";
import { CopyButton } from "../shared.js";

export function RawOutputView({ rawOutput }: { rawOutput: unknown }) {
  const text =
    typeof rawOutput === "string"
      ? rawOutput
      : JSON.stringify(rawOutput, null, 2);
  return (
    <div className="tc-content-wrapper">
      <CopyButton text={text} />
      <pre className="tc-output-pre">{text}</pre>
    </div>
  );
}

export function ToolCallErrorView({ rawOutput }: { rawOutput?: unknown }) {
  if (rawOutput == null) return null;
  let msg: string;
  if (typeof rawOutput === "string") {
    msg = rawOutput;
  } else if (typeof rawOutput === "object") {
    const obj = rawOutput as Record<string, unknown>;
    msg =
      (obj.message as string) ??
      (obj.error as string) ??
      JSON.stringify(rawOutput, null, 2);
  } else {
    msg = String(rawOutput);
  }
  return (
    <div className="tc-error-body">
      <pre className="tc-error-pre">{msg}</pre>
    </div>
  );
}

export function ToolCallContentView({
  content,
  terminals,
  rawOutput,
}: {
  content: ContentItem[];
  terminals: Map<string, TerminalState>;
  rawOutput?: unknown;
}) {
  if (content.length === 0 && rawOutput != null) {
    return <RawOutputView rawOutput={rawOutput} />;
  }

  return (
    <>
      {content.map((item, i) => {
        if (item.type === "diff" && item.diff) {
          return <UnifiedDiffView key={i} diff={item.diff} />;
        }
        if (item.type === "terminal" && item.terminal) {
          const term = terminals.get(item.terminal.terminalId);
          const output = term?.output || "(no output yet)";
          return (
            <div key={i} className="tc-terminal-view">
              <div className="tc-terminal-id">
                Terminal: {item.terminal.terminalId}
              </div>
              <CopyButton text={output} />
              <pre className="tc-output-pre">{output}</pre>
            </div>
          );
        }
        if (item.text) {
          return (
            <div key={i} className="tc-content-wrapper">
              <CopyButton text={item.text} />
              <pre className="tc-output-pre">{item.text}</pre>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

export function UnifiedDiffView({
  diff,
}: {
  diff: { path: string; oldText?: string | null; newText: string };
}) {
  const oldStr = diff.oldText ?? "";
  const newStr = diff.newText;

  const changes = Diff.structuredPatch(
    diff.path,
    diff.path,
    oldStr,
    newStr,
    "",
    "",
    { context: 3 },
  );

  return (
    <div className="tc-diff-view">
      <div className="tc-diff-path">
        {diff.path}
        <CopyButton text={newStr} />
      </div>
      <div className="diff-lines">
        {changes.hunks.map((hunk, hi) => (
          <div key={hi} className="diff-hunk">
            <div className="diff-line diff-hunk-header">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
              {hunk.newLines} @@
            </div>
            {hunk.lines.map((line, li) => {
              const prefix = line[0];
              const cls =
                prefix === "+"
                  ? "diff-add"
                  : prefix === "-"
                    ? "diff-remove"
                    : "diff-context";
              return (
                <div key={li} className={`diff-line ${cls}`}>
                  <span className="diff-line-prefix">{prefix}</span>
                  <span className="diff-line-content">{line.slice(1)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InitKVRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="init-kv-row">
      <span className="init-kv-row-icon">{icon}</span>
      <span className="init-kv-row-label">{label}</span>
      <span className="init-kv-row-value">{value}</span>
    </div>
  );
}

export function InitPillSection({
  icon,
  label,
  count,
  items,
}: {
  icon: string;
  label: string;
  count: number;
  items: string[];
}) {
  if (count === 0) return null;
  return (
    <div className="init-pill-section">
      <div className="init-pill-section-header">
        <span className="init-pill-section-icon">{icon}</span>
        <span className="init-pill-section-label">{label}</span>
        <span className="init-pill-section-count">{count}</span>
      </div>
      <div className="init-pill-list">
        {items.map((item, i) => (
          <span key={i} className="init-pill">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function InitCapsBadges({ caps }: { caps: object }) {
  const badges = capabilityBadges(caps as Record<string, unknown>);
  if (badges.length === 0) return null;
  return (
    <div className="init-pill-list">
      {badges.map((b, i) => (
        <span
          key={i}
          className={`init-pill ${b.enabled ? "init-pill-yes" : "init-pill-no"}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

function capabilityBadges(
  caps: Record<string, unknown>,
  prefix = "",
): Array<{ label: string; enabled: boolean }> {
  const badges: Array<{ label: string; enabled: boolean }> = [];
  for (const [key, val] of Object.entries(caps)) {
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      badges.push(
        ...capabilityBadges(
          val as Record<string, unknown>,
          prefix ? `${prefix}.${key}` : key,
        ),
      );
    } else {
      const label = prefix ? `${prefix}.${key}` : key;
      badges.push({ label, enabled: !!val });
    }
  }
  return badges;
}
