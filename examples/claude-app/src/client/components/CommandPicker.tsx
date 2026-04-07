import { useRef, useEffect } from "react";

export function CommandPicker({
  commands, selectedIndex, onSelect, onHover,
}: {
  commands: string[];
  selectedIndex: number;
  onSelect: (cmd: string) => void;
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
          key={cmd}
          className={`command-item ${i === selectedIndex ? "active" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="command-name">/{cmd}</span>
        </div>
      ))}
    </div>
  );
}
