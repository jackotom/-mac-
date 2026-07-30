import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchPulse } from "../src/renderer/components/MatchPulse";
import { toMatchPulseView } from "../src/renderer/matchPulse";

describe("MatchPulse", () => {
  it("formats one trusted snapshot for the main and friendly compact views", () => {
    const pulse = toMatchPulseView({
      globalTurn: 7,
      activeSide: "friendly",
      phase: "action",
      friendly: { turn: 4, mana: 7, manaUsed: 2 }
    });

    expect(pulse).toEqual({
      turn: 7,
      activeSide: "friendly",
      fullLabel: "第7回合 · 我方行动 · 法力5/7",
      compactLabel: "7回 · 我 · 5/7",
      actorLabel: "我方回合"
    });
  });

  it("omits every unknown or invalid segment instead of rendering a question mark", () => {
    const pulse = toMatchPulseView({
      globalTurn: 7,
      activeSide: "opponent",
      opponent: { mana: 5, manaUsed: 8 }
    });

    expect(pulse).toMatchObject({
      fullLabel: "第7回合 · 对手行动",
      compactLabel: "7回 · 敌",
      actorLabel: "对手回合"
    });
    expect(JSON.stringify(pulse)).not.toContain("?");
    expect(toMatchPulseView({ friendly: { mana: 7 } })).toBeUndefined();
  });

  it("renders only the information allowed by each window", () => {
    const pulse = toMatchPulseView({
      globalTurn: 7,
      activeSide: "friendly",
      friendly: { mana: 7, manaUsed: 2 }
    });

    const preview = render(<MatchPulse pulse={pulse} variant="compact" />);
    expect(screen.getByLabelText("当前对局进程")).toHaveTextContent("7回 · 我 · 5/7");

    preview.rerender(<MatchPulse pulse={pulse} variant="actor" />);
    const actor = screen.getByLabelText("当前行动方");
    expect(actor).toHaveTextContent("我方回合");
    expect(actor).toHaveAttribute("title", "我方回合");
    expect(screen.queryByText(/7回|5\/7/)).not.toBeInTheDocument();
  });
});
