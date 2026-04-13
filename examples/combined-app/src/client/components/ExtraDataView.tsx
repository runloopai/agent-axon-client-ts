import { useState } from "react";

export function ExtraDataView({ extra }: { extra?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  if (!extra || Object.keys(extra).length === 0) return null;
  return (
    <div className="extra-data">
      <button className="extra-data-toggle" onClick={() => setOpen(!open)}>
        {open ? "\u25BE Hide" : "\u25B8 Raw data"}
      </button>
      {open && <pre className="extra-data-pre">{JSON.stringify(extra, null, 2)}</pre>}
    </div>
  );
}
