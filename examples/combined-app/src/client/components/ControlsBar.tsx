import type { ModelInfo, SessionConfigOption } from "../types.js";

export function ControlsBar({
  availableModes, currentMode, configOptions, availableModels, currentModelId, autoApprovePermissions, onSetMode, onSetModel, onSetConfigOption, onSetAutoApprovePermissions,
}: {
  availableModes: Array<{ id: string; name?: string }>;
  currentMode: string | null;
  configOptions: SessionConfigOption[];
  availableModels: ModelInfo[];
  currentModelId: string | null;
  autoApprovePermissions: boolean;
  onSetMode: (modeId: string) => void;
  onSetModel: (modelId: string) => void;
  onSetConfigOption: (optionId: string, valueId: string) => void;
  onSetAutoApprovePermissions: (enabled: boolean) => void;
}) {
  return (
    <div className="controls-bar">
      {availableModes.length > 0 && (
        <div className="mode-switcher">
          {availableModes.map((mode) => (
            <button
              key={mode.id}
              className={`mode-btn ${currentMode === mode.id ? "active" : ""}`}
              onClick={() => onSetMode(mode.id)}
            >
              {mode.name ?? mode.id}
            </button>
          ))}
        </div>
      )}
      {availableModels.length > 0 && (
        <span>
          <span className="config-label">Model:</span>
          <select
            className="config-select"
            value={currentModelId ?? ""}
            onChange={(e) => onSetModel(e.target.value)}
          >
            {availableModels.map((m) => (
              <option key={m.modelId} value={m.modelId}>{m.name}</option>
            ))}
          </select>
        </span>
      )}
      {configOptions.map((opt) => {
        if (opt.type === "boolean") {
          return (
            <label key={opt.id} className="config-toggle">
              <input
                type="checkbox"
                checked={opt.currentValue}
                onChange={(e) => onSetConfigOption(opt.id, String(e.target.checked))}
              />
              <span className="config-toggle-label">{opt.name}</span>
            </label>
          );
        }
        if (opt.type !== "select") return null;
        const flatOptions: Array<{ value: string; name: string }> = [];
        for (const o of opt.options) {
          if ("group" in o) {
            flatOptions.push(...o.options);
          } else {
            flatOptions.push(o);
          }
        }
        return (
          <span key={opt.id}>
            <span className="config-label">{opt.name}:</span>
            <select
              className="config-select"
              value={opt.currentValue ?? ""}
              onChange={(e) => onSetConfigOption(opt.id, e.target.value)}
            >
              {flatOptions.map((val) => (
                <option key={val.value} value={val.value}>
                  {val.name}
                </option>
              ))}
            </select>
          </span>
        );
      })}
      <label className="config-toggle">
        <input
          type="checkbox"
          checked={autoApprovePermissions}
          onChange={(e) => onSetAutoApprovePermissions(e.target.checked)}
        />
        <span className="config-toggle-label">Auto-approve permissions</span>
      </label>
    </div>
  );
}
