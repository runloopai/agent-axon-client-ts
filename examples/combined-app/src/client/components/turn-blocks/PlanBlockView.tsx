import type { PlanBlock, PlanEntry, TaskBlock } from "../../types.js";
import { MarkdownContent, planStatusIcon } from "../shared.js";
import { ExtraDataView } from "../ExtraDataView.js";

export function PlanBlockView({ block }: { block: PlanBlock }) {
  return (
    <div className="turn-block plan-block">
      <div className="plan-header">Plan</div>
      <div className="plan-entries">
        {block.entries.map((entry, i) => (
          <PlanEntryView key={i} entry={entry} />
        ))}
      </div>
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

function PlanEntryView({ entry }: { entry: PlanEntry }) {
  return (
    <div className={`plan-entry plan-entry-${entry.status}`}>
      {planStatusIcon(entry.status)}
      <MarkdownContent text={entry.content} className="plan-entry-text" />
      {entry.priority && (
        <span className={`plan-priority plan-priority-${entry.priority}`}>
          {entry.priority}
        </span>
      )}
    </div>
  );
}

export function TaskBlockView({ block }: { block: TaskBlock }) {
  const isActive = block.status === "started" || block.status === "in_progress";
  return (
    <div className="turn-block task-block">
      <div className="task-header">
        {isActive ? (
          <span className="tc-status-spinner" />
        ) : block.status === "completed" ? (
          <span className="tc-status-check">{"\u2713"}</span>
        ) : (
          <span className="tc-status-fail">{"\u2717"}</span>
        )}
        <MarkdownContent
          text={block.description}
          className="task-description"
        />
        {block.toolUses != null && (
          <span className="task-meta">{block.toolUses} tools</span>
        )}
      </div>
      {block.summary && (
        <MarkdownContent text={block.summary} className="task-summary" />
      )}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}
