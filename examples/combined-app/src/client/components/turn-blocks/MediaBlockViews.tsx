import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ImageBlock, AudioBlock, EmbeddedResourceBlock, ResourceLinkBlock } from "../../types.js";
import { CopyButton } from "../shared.js";
import { ExtraDataView } from "../ExtraDataView.js";

export function ResourceLinkBlockView({ block }: { block: ResourceLinkBlock }) {
  const label = block.title ?? block.name ?? block.uri;
  return (
    <div className="turn-block resource-link-block">
      <a
        href={block.uri}
        target="_blank"
        rel="noopener noreferrer"
        className="resource-link"
      >
        <span className="resource-link-icon">{"\u{1F517}"}</span>
        <span className="resource-link-label">{label}</span>
        {block.name && block.title && block.name !== block.title && (
          <span className="resource-link-name">{block.name}</span>
        )}
      </a>
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

export function ImageBlockView({ block }: { block: ImageBlock }) {
  const src = `data:${block.mimeType};base64,${block.data}`;
  return (
    <div className="turn-block image-block">
      <img src={src} alt="" className="image-block-img" />
      {block.uri && (
        <a
          href={block.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="image-block-link"
        >
          Open original
        </a>
      )}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

export function AudioBlockView({ block }: { block: AudioBlock }) {
  const src = `data:${block.mimeType};base64,${block.data}`;
  return (
    <div className="turn-block audio-block">
      <audio controls src={src} className="audio-block-player" />
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

const MIME_TO_LANG: Record<string, string> = {
  "application/json": "json",
  "application/javascript": "javascript",
  "text/javascript": "javascript",
  "text/typescript": "typescript",
  "text/html": "html",
  "text/css": "css",
  "text/markdown": "markdown",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/yaml": "yaml",
  "text/yaml": "yaml",
  "text/x-python": "python",
  "text/x-rust": "rust",
  "text/x-go": "go",
  "text/x-java": "java",
  "text/x-c": "c",
  "text/x-cpp": "cpp",
  "text/x-shell": "bash",
};

export function EmbeddedResourceBlockView({
  block,
}: {
  block: EmbeddedResourceBlock;
}) {
  const basename = block.uri.split("/").pop() ?? block.uri;

  if (block.text != null) {
    const lang = block.mimeType ? MIME_TO_LANG[block.mimeType] : undefined;
    return (
      <div className="turn-block resource-block">
        <div className="resource-block-header">
          <span className="resource-block-icon">{"\u{1F4C4}"}</span>
          <span className="resource-block-name">{basename}</span>
          <CopyButton text={block.text} />
        </div>
        {lang ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={lang}
            customStyle={{
              margin: 0,
              borderRadius: "0 0 6px 6px",
              fontSize: "12px",
            }}
          >
            {block.text}
          </SyntaxHighlighter>
        ) : (
          <pre className="resource-block-pre">{block.text}</pre>
        )}
        <ExtraDataView extra={block.extra} />
      </div>
    );
  }

  if (block.blob != null) {
    const href = `data:${block.mimeType ?? "application/octet-stream"};base64,${block.blob}`;
    return (
      <div className="turn-block resource-block">
        <div className="resource-block-header">
          <span className="resource-block-icon">{"\u{1F4BE}"}</span>
          <span className="resource-block-name">{basename}</span>
        </div>
        <a href={href} download={basename} className="resource-block-download">
          Download {basename}
        </a>
        <ExtraDataView extra={block.extra} />
      </div>
    );
  }

  return (
    <div className="turn-block resource-block">
      <div className="resource-block-header">
        <span className="resource-block-icon">{"\u{1F4C4}"}</span>
        <span className="resource-block-name">{basename}</span>
      </div>
      <ExtraDataView extra={block.extra} />
    </div>
  );
}
