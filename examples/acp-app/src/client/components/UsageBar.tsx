import type { UsageState } from "../hooks/useNodeAgent.js";

export function UsageBar({ usage }: { usage: UsageState }) {
  const pct = usage.size > 0 ? Math.round((usage.used / usage.size) * 100) : 0;
  return (
    <div className="usage-bar" title={`${usage.used.toLocaleString()} / ${usage.size.toLocaleString()} tokens`}>
      <div className="usage-track">
        <div className="usage-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="usage-label">{pct}%</span>
      {usage.cost && (
        <span className="usage-cost">${usage.cost.amount.toFixed(4)} {usage.cost.currency}</span>
      )}
    </div>
  );
}
