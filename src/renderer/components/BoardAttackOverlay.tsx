import { Swords } from "lucide-react";
import type { OverlayBoardAttack } from "../types";

interface BoardAttackOverlayProps {
  attack?: OverlayBoardAttack;
}

export function BoardAttackOverlay({ attack }: BoardAttackOverlayProps) {
  return (
    <main className="board-attack-overlay-canvas" aria-label="场攻悬浮窗">
      <AttackIcon side="opponent" label="对方" value={attack?.opponent} left="25.5%" top="22.39%" />
      <AttackIcon side="friendly" label="我方" value={attack?.friendly} left="25.5%" top="67.62%" />
    </main>
  );
}

function AttackIcon({
  side,
  label,
  value,
  left,
  top
}: {
  side: "friendly" | "opponent";
  label: "我方" | "对方";
  value?: number;
  left: string;
  top: string;
}) {
  return (
    <div
      className={`board-attack-icon board-attack-icon-${side}`}
      style={{ left, top }}
      aria-label={value === undefined ? `${label}场攻未知` : `${label}场攻 ${value}`}
    >
      <Swords aria-hidden="true" />
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
