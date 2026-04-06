import type { PendingPermission } from "../hooks/useNodeAgent.js";

export function PermissionDialog({
  permission,
  onAllow,
  onCancel,
}: {
  permission: PendingPermission;
  onAllow: (requestId: string, optionId: string) => void;
  onCancel: (requestId: string) => void;
}) {
  const rawInput = permission.rawInput as Record<string, unknown> | undefined;

  return (
    <div className="elicitation-form">
      <div className="elicitation-message">
        Permission requested: <strong>{permission.toolTitle}</strong>
      </div>
      {rawInput && Object.keys(rawInput).length > 0 && (
        <pre className="permission-raw-input">
          {JSON.stringify(rawInput, null, 2)}
        </pre>
      )}
      <div className="permission-actions">
        {permission.options.map((opt) => {
          const isReject = opt.kind === "reject_once" || opt.kind === "reject_always";
          return (
            <button
              key={opt.optionId}
              className={`btn permission-btn ${isReject ? "permission-btn-reject" : "permission-btn-allow"}`}
              onClick={() =>
                isReject
                  ? onCancel(permission.requestId)
                  : onAllow(permission.requestId, opt.optionId)
              }
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
