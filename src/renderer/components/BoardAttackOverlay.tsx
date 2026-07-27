import { Swords } from "lucide-react";
import type { OverlayBoardAttack } from "../types";

interface BoardAttackOverlayProps {
  attack?: OverlayBoardAttack;
  showFriendly?: boolean;
  showOpponent?: boolean;
}

export function BoardAttackOverlay({ attack, showFriendly = true, showOpponent = true }: BoardAttackOverlayProps) {
  return (
    <main className="board-attack-overlay-canvas" aria-label="场攻悬浮窗">
      {showOpponent && attack?.opponent !== undefined
        ? <AttackCounter side="opponent" label="对方" value={attack.opponent} left="25.5%" top="22.39%" />
        : null}
      {showFriendly && attack?.friendly !== undefined
        ? <AttackCounter side="friendly" label="我方" value={attack.friendly} left="25.5%" top="67.62%" />
        : null}
    </main>
  );
}

function AttackCounter({
  side,
  label,
  value,
  left,
  top
}: {
  side: "friendly" | "opponent";
  label: "我方" | "对方";
  value: number;
  left: string;
  top: string;
}) {
  return (
    <output
      className={`board-attack-icon board-attack-icon-${side} board-attack-counter board-attack-counter-${side}`}
      style={{ left, top }}
      aria-label={`${label}场攻 ${value}`}
    >
      <span className="board-attack-counter-icon" aria-hidden="true">
        <Swords />
      </span>
      <strong className="board-attack-counter-value">{value}</strong>
    </output>
  );
}
