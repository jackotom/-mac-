import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardDetailBody } from "../src/renderer/components/CardDetailBody";
import type { CardDetails } from "../src/shared/cardDatabase";

const cardHoverStyles = readFileSync(join(process.cwd(), "src/renderer/cardHoverStyles.css"), "utf8");

const baseDetails: CardDetails = {
  dbfId: 119566,
  cardId: "VAC_520",
  name: "匣中古神",
  manaCost: 7,
  cardType: "法术",
  text: "随机施放5个法术。",
  isSpell: true,
  relatedCards: []
};

describe("CardDetailBody related cards", () => {
  it("shows an explicit empty state instead of silently omitting the related-card section", () => {
    render(<CardDetailBody details={baseDetails} />);

    expect(screen.getByText("生成/关联法术（0）")).toBeInTheDocument();
    expect(screen.getByText("暂无生成或关联法术资料")).toBeInTheDocument();
  });

  it("shows the full related-card count and keeps entries in a dedicated full-width list", () => {
    const relatedCards = Array.from({ length: 24 }, (_, index) => ({
      dbfId: 2000 + index,
      cardId: `RELATED_${index}`,
      name: `关联法术 ${index + 1}`,
      manaCost: index % 10,
      cardType: "法术"
    }));

    const { container } = render(
      <CardDetailBody details={{ ...baseDetails, relatedCards }} />
    );

    const section = container.querySelector(".card-detail-related");
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent("生成/关联法术（24）");
    expect(within(section as HTMLElement).getAllByText(/^关联法术 \d+$/)).toHaveLength(24);
    expect(section?.querySelector(".card-related-cards")).toHaveAttribute("role", "list");
  });

  it("keeps duplicate entries visible without React duplicate-key warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          relatedCards: [
            { dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" },
            { dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" }
          ]
        }}
      />
    );

    expect(screen.getAllByText("火球术")).toHaveLength(2);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    consoleError.mockRestore();
  });

  it("renders a visible placeholder for related cards without artwork", () => {
    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          relatedCards: [
            { dbfId: 621, cardId: "EX1_279", name: "炎爆术", manaCost: 10, cardType: "法术" }
          ]
        }}
      />
    );

    expect(screen.getByLabelText("炎爆术无卡图")).toHaveTextContent("无图");
  });

  it("keeps the theoretical pool separate from the five spells actually cast this game", () => {
    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          cardPoolSections: [{
            key: "random-spells",
            title: "随机法术池",
            emptyText: "当前卡牌库没有可匹配的法术",
            cards: [
              { dbfId: 1, cardId: "POOL_1", name: "候选法术一", manaCost: 5, cardType: "法术" },
              { dbfId: 2, cardId: "POOL_2", name: "候选法术二", manaCost: 6, cardType: "法术" }
            ]
          }],
          playedSpellsThisGame: [
            { dbfId: 10, cardId: "CAST_1", name: "实际法术一", manaCost: 5, cardType: "法术" },
            { dbfId: 11, cardId: "CAST_2", name: "实际法术二", manaCost: 6, cardType: "法术" },
            { dbfId: 10, cardId: "CAST_1", name: "实际法术一", manaCost: 5, cardType: "法术" },
            { dbfId: 12, cardId: "CAST_3", name: "实际法术三", manaCost: 7, cardType: "法术" },
            { dbfId: 13, cardId: "CAST_4", name: "实际法术四", manaCost: 8, cardType: "法术" }
          ]
        }}
      />
    );

    const pool = screen.getByRole("region", { name: "随机法术池，共 2 张" });
    const actual = screen.getByRole("region", { name: "本局已施放法术，共 5 张" });
    expect(pool).toHaveTextContent("候选法术一");
    expect(pool).not.toHaveTextContent("实际法术一");
    expect(within(actual).getAllByText("实际法术一")).toHaveLength(2);
    expect(within(actual).getAllByRole("listitem")).toHaveLength(5);
  });

  it("shows a clear zero-result state for the actual spells without hiding the theoretical pool", () => {
    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          cardPoolSections: [{
            key: "random-spells",
            title: "随机法术池",
            emptyText: "当前卡牌库没有可匹配的法术",
            cards: [{ dbfId: 1, cardId: "POOL_1", name: "候选法术", manaCost: 5, cardType: "法术" }]
          }],
          playedSpellsThisGame: []
        }}
      />
    );

    expect(screen.getByRole("region", { name: "随机法术池，共 1 张" })).toHaveTextContent("候选法术");
    expect(screen.getByRole("region", { name: "本局已施放法术，共 0 张" }))
      .toHaveTextContent("本局还没有施放过法术");
  });

  it("shows all ten actual casts in order when the effect is doubled", () => {
    const doubledSpells = Array.from({ length: 10 }, (_, index) => ({
      dbfId: 100 + (index % 5),
      cardId: `CAST_${index % 5}`,
      name: `实际法术${(index % 5) + 1}`,
      manaCost: 5 + (index % 5),
      cardType: "法术"
    }));

    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          playedSpellsThisGame: doubledSpells
        }}
      />
    );

    const actual = screen.getByRole("region", { name: "本局已施放法术，共 10 张" });
    expect(within(actual).getAllByRole("listitem")).toHaveLength(10);
    expect(within(actual).getAllByText("实际法术1")).toHaveLength(2);
    expect([...actual.querySelectorAll("strong")].map((item) => item.textContent))
      .toEqual(doubledSpells.map((card) => card.name));
  });

  it("keeps long theoretical and actual lists inside their own scroll areas", () => {
    expect(cardHoverStyles).toMatch(
      /:is\(\.card-pool-section,\s*\.card-game-context\) \.card-related-cards\s*\{[\s\S]*?max-height:\s*220px;[\s\S]*?overflow-y:\s*auto;/
    );
    expect(cardHoverStyles).toMatch(
      /\.card-outcome-section > \.card-outcome-tree\s*\{[\s\S]*?max-height:\s*220px;[\s\S]*?overflow-y:\s*auto;/
    );
    expect(cardHoverStyles).toMatch(
      /\.card-outcome-children\s*\{[\s\S]*?border-left:/
    );
  });

  it("shows a doubled outcome as ten ordered root cards and preserves repeats", () => {
    const cards = Array.from({ length: 10 }, (_, index) => ({
      key: `cast-${index + 1}`,
      card: {
        dbfId: 100 + (index % 5),
        cardId: `CAST_${index % 5}`,
        name: `实际法术${(index % 5) + 1}`,
        manaCost: 5 + (index % 5),
        cardType: "法术"
      }
    }));
    const { container } = render(
      <CardDetailBody
        details={{
          ...baseDetails,
          cardOutcomeSections: [{
            key: "cast-1",
            title: "本次实际施放",
            emptyText: "本次尚未确认施放结果",
            cards
          }]
        }}
      />
    );

    const section = screen.getByRole("region", { name: "本次实际施放，共 10 张" });
    const roots = container.querySelectorAll(
      ".card-outcome-section > .card-outcome-tree > .card-outcome-node"
    );
    expect(roots).toHaveLength(10);
    expect(within(section).getAllByText("实际法术1")).toHaveLength(2);
    expect([...section.querySelectorAll(".card-outcome-node > .card-related-card strong")].map((item) => item.textContent))
      .toEqual(cards.map((node) => node.card.name));
  });

  it("keeps separate use outcome sections scoped instead of mixing same-card results", () => {
    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          cardOutcomeSections: [
            {
              key: "use-1",
              title: "第1次实际施放",
              emptyText: "本次尚未确认施放结果",
              cards: [
                {
                  key: "use-1-fireball-1",
                  card: { dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" }
                },
                {
                  key: "use-1-fireball-2",
                  card: { dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" }
                }
              ]
            },
            {
              key: "use-2",
              title: "第2次实际施放",
              emptyText: "本次尚未确认施放结果",
              cards: [{
                key: "use-2-pyroblast",
                card: { dbfId: 621, cardId: "EX1_279", name: "炎爆术", manaCost: 10, cardType: "法术" }
              }]
            }
          ]
        }}
      />
    );

    const firstUse = screen.getByRole("region", { name: "第1次实际施放，共 2 张" });
    const secondUse = screen.getByRole("region", { name: "第2次实际施放，共 1 张" });
    expect(within(firstUse).getAllByText("火球术")).toHaveLength(2);
    expect(within(firstUse).queryByText("炎爆术")).not.toBeInTheDocument();
    expect(within(secondUse).getByText("炎爆术")).toBeVisible();
    expect(within(secondUse).queryByText("火球术")).not.toBeInTheDocument();
  });

  it("shows nested Yogg outcomes as a readable trigger hierarchy instead of one flat list", () => {
    const { container } = render(
      <CardDetailBody
        details={{
          ...baseDetails,
          cardPoolSections: [{
            key: "random-spells",
            title: "随机法术池",
            emptyText: "当前卡牌库没有可匹配的法术",
            cards: [{ dbfId: 103270, cardId: "TOY_372", name: "匣中古神", manaCost: 7, cardType: "法术" }]
          }],
          cardOutcomeSections: [{
            key: "cast-1",
            title: "本次实际施放",
            emptyText: "本次尚未确认施放结果",
            cards: [{
              key: "root-yogg",
              card: { dbfId: 103270, cardId: "TOY_372", name: "匣中古神", manaCost: 7, cardType: "法术" },
              children: [
                {
                  key: "nested-fireball",
                  card: { dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" }
                },
                {
                  key: "nested-yogg",
                  card: { dbfId: 103270, cardId: "TOY_372", name: "匣中古神", manaCost: 7, cardType: "法术" },
                  children: [
                    {
                      key: "deep-fireball",
                      card: { dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" }
                    }
                  ]
                }
              ]
            }]
          }]
        }}
      />
    );

    expect(screen.getByRole("region", { name: "随机法术池，共 1 张" })).toBeInTheDocument();
    const outcome = screen.getByRole("region", { name: "本次实际施放，共 1 张" });
    expect(within(outcome).getByText("由「匣中古神」触发（2）")).toBeVisible();
    expect(within(outcome).getByText("由「匣中古神」触发（1）")).toBeVisible();
    expect(within(outcome).getAllByText("匣中古神")).toHaveLength(2);
    expect(within(outcome).getAllByText("火球术")).toHaveLength(2);
    expect(container.querySelectorAll(".card-outcome-children")).toHaveLength(2);
    expect(container.querySelectorAll(".card-outcome-section .card-related-cards")).toHaveLength(0);
  });

  it("shows the outcome-specific empty state without hiding the theoretical pool", () => {
    render(
      <CardDetailBody
        details={{
          ...baseDetails,
          cardPoolSections: [{
            key: "random-spells",
            title: "随机法术池",
            emptyText: "当前卡牌库没有可匹配的法术",
            cards: [{ dbfId: 315, cardId: "CS2_029", name: "火球术", manaCost: 4, cardType: "法术" }]
          }],
          cardOutcomeSections: [{
            key: "cast-1",
            title: "本次实际施放",
            emptyText: "本次尚未确认施放结果",
            cards: []
          }]
        }}
      />
    );

    expect(screen.getByRole("region", { name: "随机法术池，共 1 张" })).toHaveTextContent("火球术");
    expect(screen.getByRole("region", { name: "本次实际施放，共 0 张" }))
      .toHaveTextContent("本次尚未确认施放结果");
  });
});
