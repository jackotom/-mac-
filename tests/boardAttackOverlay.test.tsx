import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardAttackOverlay } from "../src/renderer/components/BoardAttackOverlay";

describe("board attack overlay", () => {
  it("renders two independent attack icons on a transparent canvas", () => {
    render(<BoardAttackOverlay attack={{ friendly: 7, opponent: 12 }} />);

    expect(screen.getByLabelText("场攻悬浮窗")).toHaveClass("board-attack-overlay-canvas");
    expect(screen.getByLabelText("对方场攻 12")).toHaveTextContent("12");
    expect(screen.getByLabelText("我方场攻 7")).toHaveTextContent("7");
  });

  it("shows an unknown state until board attack has been read", () => {
    render(<BoardAttackOverlay />);

    expect(screen.getByLabelText("对方场攻未知")).toHaveTextContent("—");
    expect(screen.getByLabelText("我方场攻未知")).toHaveTextContent("—");
    expect(screen.queryByLabelText("对方场攻 0")).not.toBeInTheDocument();
  });
});
