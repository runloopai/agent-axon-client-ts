import type { Attachment } from "./types.js";

function formatSize(text: string): string {
  const bytes = new Blob([text]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentBar({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="attachment-bar">
      {attachments.map((a, i) =>
        a.type === "image" ? (
          <div key={i} className="attachment-preview">
            <img
              src={a.preview}
              alt={a.name}
              className="attachment-thumb"
            />
            <span className="attachment-name">{a.name}</span>
            <button
              className="attachment-remove"
              onClick={() => onRemove(i)}
              title="Remove"
            >
              &times;
            </button>
          </div>
        ) : (
          <div key={i} className="attachment-preview attachment-file-badge">
            <span className="attachment-file-icon">📄</span>
            <span className="attachment-name">{a.name}</span>
            <span className="attachment-size">{formatSize(a.text)}</span>
            <button
              className="attachment-remove"
              onClick={() => onRemove(i)}
              title="Remove"
            >
              &times;
            </button>
          </div>
        ),
      )}
    </div>
  );
}
