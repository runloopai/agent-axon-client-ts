import type { TextBlock } from "../../types.js";
import { MarkdownContent } from "../shared.js";
import { ExtraDataView } from "../ExtraDataView.js";

export function TextBlockView({
  block,
  showCursor,
}: {
  block: TextBlock;
  showCursor: boolean;
}) {
  return (
    <div className="turn-block text-block">
      <MarkdownContent text={block.text} />
      {showCursor && <span className="streaming-cursor" />}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}
