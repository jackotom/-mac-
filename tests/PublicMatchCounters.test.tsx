import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicMatchCounters } from "../src/renderer/components/PublicMatchCounters";

describe("public match counters", () => {
  it("shows short text and live values while retaining complete friendly labels", () => {
    render(
      <PublicMatchCounters
        side="friendly"
        counters={{ nextFatigueDamage: 0, corpses: 6, spellsPlayed: 8 }}
      />
    );

    const counters = screen.getByRole("region", { name: "我方公开计数" });
    const fatigue = within(counters).getByLabelText("我方下次疲劳伤害 0");
    const corpses = within(counters).getByLabelText("我方尸体 6");
    const spells = within(counters).getByLabelText("我方已用法术 8");

    expect(fatigue).toHaveAttribute("title", "我方下次疲劳伤害");
    expect(corpses).toHaveAttribute("title", "我方尸体");
    expect(spells).toHaveAttribute("title", "我方已用法术");
    expect(fatigue.querySelector(".overlay-public-counter-label")).toHaveTextContent("疲劳");
    expect(corpses.querySelector(".overlay-public-counter-label")).toHaveTextContent("尸体");
    expect(spells.querySelector(".overlay-public-counter-label")).toHaveTextContent("法术");
    expect(fatigue.querySelector(".overlay-public-counter-value")).toHaveTextContent("0");
    expect(corpses.querySelector(".overlay-public-counter-value")).toHaveTextContent("6");
    expect(spells.querySelector(".overlay-public-counter-value")).toHaveTextContent("8");
    expect(counters.querySelector("svg")).not.toBeInTheDocument();
  });

  it("uses the same text for the opponent and updates the rendered number", () => {
    const preview = render(
      <PublicMatchCounters side="opponent" counters={{ nextFatigueDamage: 3 }} />
    );

    const fatigue = screen.getByLabelText("对方下次疲劳伤害 3");
    expect(fatigue).toHaveAttribute("title", "对方下次疲劳伤害");
    expect(fatigue.querySelector(".overlay-public-counter-label")).toHaveTextContent("疲劳");
    expect(fatigue.querySelector(".overlay-public-counter-value")).toHaveTextContent("3");
    expect(screen.queryByLabelText(/对方尸体/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/对方已用法术/)).not.toBeInTheDocument();

    preview.rerender(
      <PublicMatchCounters side="opponent" counters={{ nextFatigueDamage: 4 }} />
    );

    expect(screen.queryByLabelText("对方下次疲劳伤害 3")).not.toBeInTheDocument();
    expect(screen.getByLabelText("对方下次疲劳伤害 4")).toHaveTextContent("疲劳4");
  });
});
