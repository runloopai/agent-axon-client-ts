import { useState, useEffect } from "react";
import type { PendingElicitation, ElicitationFieldSchema, ElicitationAction, ElicitationContentValue } from "../hooks/useNodeAgent.js";

export function ElicitationForm({
  elicitation, onRespond,
}: {
  elicitation: PendingElicitation;
  onRespond: (requestId: string, action: ElicitationAction) => void;
}) {
  const [values, setValues] = useState<Record<string, ElicitationContentValue>>({});

  useEffect(() => {
    if (elicitation.schema?.properties) {
      const defaults: Record<string, ElicitationContentValue> = {};
      for (const [key, field] of Object.entries(elicitation.schema.properties)) {
        if (field.default != null) defaults[key] = field.default;
      }
      setValues(defaults);
    }
  }, [elicitation]);

  const handleSubmit = () => {
    onRespond(elicitation.requestId, { action: "accept", content: values });
  };

  const handleDecline = () => {
    onRespond(elicitation.requestId, { action: "decline" });
  };

  if (elicitation.mode === "url") {
    return (
      <div className="elicitation-form">
        <div className="elicitation-message">{elicitation.message}</div>
        {elicitation.url && (
          <a href={elicitation.url} target="_blank" rel="noopener noreferrer" className="elicitation-url">
            {elicitation.url}
          </a>
        )}
        <div className="elicitation-actions">
          <button className="btn btn-ghost" onClick={handleDecline}>Dismiss</button>
        </div>
      </div>
    );
  }

  const properties = elicitation.schema?.properties ?? {};
  const required = new Set(elicitation.schema?.required ?? []);

  return (
    <div className="elicitation-form">
      <div className="elicitation-message">{elicitation.message}</div>
      {elicitation.schema?.title && (
        <div className="elicitation-title">{elicitation.schema.title}</div>
      )}
      <div className="elicitation-fields">
        {Object.entries(properties).map(([key, field]) => (
          <ElicitationField
            key={key}
            name={key}
            field={field}
            required={required.has(key)}
            value={values[key]}
            onChange={(v) => setValues((prev) => {
              const next = { ...prev };
              if (v === undefined) delete next[key]; else next[key] = v;
              return next;
            })}
          />
        ))}
      </div>
      <div className="elicitation-actions">
        <button className="btn btn-primary elicitation-submit" onClick={handleSubmit}>Submit</button>
        <button className="btn btn-ghost" onClick={handleDecline}>Decline</button>
      </div>
    </div>
  );
}

function ElicitationField({
  name, field, required, value, onChange,
}: {
  name: string;
  field: ElicitationFieldSchema;
  required: boolean;
  value: ElicitationContentValue | undefined;
  onChange: (v: ElicitationContentValue | undefined) => void;
}) {
  const label = field.title ?? name;
  const isEnum = field.type === "string" && (field.enum || field.oneOf);

  if (field.type === "boolean") {
    return (
      <label className="elicitation-field elicitation-field-bool">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
        {field.description && <span className="elicitation-field-desc">{field.description}</span>}
      </label>
    );
  }

  if (isEnum) {
    const options = field.oneOf
      ? field.oneOf.map((o) => ({ value: o.const, label: o.title }))
      : (field.enum ?? []).map((v) => ({ value: v, label: v }));
    return (
      <div className="elicitation-field">
        <label className="elicitation-field-label">
          {label}{required && <span className="elicitation-required">*</span>}
        </label>
        {field.description && <div className="elicitation-field-desc">{field.description}</div>}
        <select
          className="config-select elicitation-select"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "array") {
    const items = field.items;
    const options = items?.oneOf
      ? items.oneOf.map((o) => ({ value: o.const, label: o.title }))
      : (items?.enum ?? []).map((v) => ({ value: v, label: v }));
    const selected = new Set((value as string[]) ?? []);
    return (
      <div className="elicitation-field">
        <label className="elicitation-field-label">
          {label}{required && <span className="elicitation-required">*</span>}
        </label>
        {field.description && <div className="elicitation-field-desc">{field.description}</div>}
        <div className="elicitation-multi-select">
          {options.map((o) => (
            <label key={o.value} className="elicitation-checkbox-option">
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  e.target.checked ? next.add(o.value) : next.delete(o.value);
                  onChange([...next]);
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "number" || field.type === "integer") {
    return (
      <div className="elicitation-field">
        <label className="elicitation-field-label">
          {label}{required && <span className="elicitation-required">*</span>}
        </label>
        {field.description && <div className="elicitation-field-desc">{field.description}</div>}
        <input
          type="number"
          className="elicitation-input"
          value={(value as number) ?? ""}
          step={field.type === "integer" ? 1 : "any"}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </div>
    );
  }

  return (
    <div className="elicitation-field">
      <label className="elicitation-field-label">
        {label}{required && <span className="elicitation-required">*</span>}
      </label>
      {field.description && <div className="elicitation-field-desc">{field.description}</div>}
      <input
        type="text"
        className="elicitation-input"
        value={(value as string) ?? ""}
        placeholder={field.description ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
