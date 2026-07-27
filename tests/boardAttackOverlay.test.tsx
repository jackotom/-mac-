import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardAttackOverlay } from "../src/renderer/components/BoardAttackOverlay";

describe("board attack overlay", () => {
  it("renders two independent circular counters with the sword above the value", () => {
    render(<BoardAttackOverlay attack={{ friendly: 7, opponent: 12 }} />);

    expect(screen.getByLabelText("场攻悬浮窗")).toHaveClass("board-attack-overlay-canvas");
    const opponent = screen.getByLabelText("对方场攻 12");
    const friendly = screen.getByLabelText("我方场攻 7");
    expect(opponent).toHaveClass("board-attack-counter", "board-attack-counter-opponent");
    expect(friendly).toHaveClass("board-attack-counter", "board-attack-counter-friendly");
    expect(opponent.querySelector(".board-attack-counter-icon"))
      .toHaveClass("board-attack-counter-icon");
    expect(opponent.querySelector(".board-attack-counter-value")).toHaveTextContent("12");
    expect(
      opponent.querySelector(".board-attack-counter-icon")?.compareDocumentPosition(
        opponent.querySelector(".board-attack-counter-value") as Node
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps zero meaningful and hides counters whose value is unavailable", () => {
    const preview = render(<BoardAttackOverlay attack={{ friendly: 0, opponent: 0 }} />);

    expect(screen.getByLabelText("对方场攻 0")).toHaveTextContent("0");
    expect(screen.getByLabelText("我方场攻 0")).toHaveTextContent("0");

    preview.rerender(<BoardAttackOverlay />);

    expect(screen.queryByLabelText(/对方场攻/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/我方场攻/)).not.toBeInTheDocument();
  });
});
