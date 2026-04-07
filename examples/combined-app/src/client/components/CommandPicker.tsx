import { useRef, useEffect } from "react";
import type { AvailableCommand } from "../types.js";

export function CommandPicker({
  commands, selectedIndex, onSelect, onHover,
}: {
  commands: AvailableCommand[];
  selectedIndex: number;
  onSelect: (cmd: AvailableCommand) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="command-picker" ref={listRef}>
      {commands.map((cmd, i) => (
        <div
          key={cmd.name}
          className={`command-item ${i === selectedIndex ? "active" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="command-name">/{cmd.name}</span>
          <span className="command-description">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}
