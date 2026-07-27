import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardHoverPreview } from "../src/renderer/components/CardHoverPreview";
import type { CardDetails } from "../src/shared/cardDatabase";

const cardDetails: CardDetails = {
  dbfId: 315,
  name: "火球术",
  manaCost: 4,
  cardType: "法术",
  cardTypeId: 5,
  text: "造成 6 点伤害。",
  isSpell: true,
  relatedCards: []
};

describe("CardHoverPreview", () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.pushState({}, "", "/");
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: undefined
    });
  });

  it("uses the external preview window in overlay mode", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "火球术" }));

    expect(showCardPreview).toHaveBeenCalledWith({
      details: cardDetails,
      anchorRect: expect.objectContaining({
        left: expect.any(Number),
        top: expect.any(Number),
        right: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number)
      })
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("button", { name: "火球术" }));

    expect(hideCardPreview).not.toHaveBeenCalled();
    vi.advanceTimersByTime(130);
    expect(hideCardPreview).toHaveBeenCalled();
  });

  it("clears a stale external preview when the hover state is gone", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "火球术" }));
    vi.advanceTimersByTime(650);

    expect(hideCardPreview).toHaveBeenCalled();
  });

  it("keeps the external preview visible when the pointer is still inside the anchor bounds", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 60,
      width: 200,
      height: 40,
      x: 10,
      y: 20,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(target, "matches").mockReturnValue(false);

    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    vi.advanceTimersByTime(550);

    expect(hideCardPreview).not.toHaveBeenCalled();
    expect(showCardPreview).toHaveBeenCalledTimes(2);
  });

  it("hides the external preview on window blur and requires a new hover to show again", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 60,
      width: 200,
      height: 40,
      x: 10,
      y: 20,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(target, "matches").mockReturnValue(true);

    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    window.dispatchEvent(new Event("blur"));
    act(() => vi.advanceTimersByTime(1_000));

    expect(hideCardPreview).toHaveBeenCalledTimes(1);
    expect(showCardPreview).toHaveBeenCalledTimes(1);

    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    expect(showCardPreview).toHaveBeenCalledTimes(2);
  });

  it("hides the external preview when the document becomes hidden", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "火球术" }));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true
    });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1_000);

    expect(hideCardPreview).toHaveBeenCalledTimes(1);
    expect(showCardPreview).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false
    });
  });

  it("pins the active external preview with Option+Q until Option+Q is pressed again", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    let notifyPinnedChange: ((pinned: boolean) => void) | undefined;
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview,
        onCardPreviewPinnedChange: (callback: (pinned: boolean) => void) => {
          notifyPinnedChange = callback;
          return () => undefined;
        }
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 60,
      width: 200,
      height: 40,
      x: 10,
      y: 20,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(target, "matches").mockReturnValue(false);

    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    act(() => notifyPinnedChange?.(true));

    expect(target).toHaveAttribute("data-preview-pinned", "true");
    expect(target).toHaveAttribute("aria-keyshortcuts", "Alt+Q");

    fireEvent.mouseLeave(button, { clientX: 260, clientY: 40 });
    vi.advanceTimersByTime(1_000);
    expect(hideCardPreview).not.toHaveBeenCalled();

    act(() => notifyPinnedChange?.(false));
    fireEvent.mouseLeave(button, { clientX: 260, clientY: 40 });
    act(() => vi.advanceTimersByTime(130));
    expect(hideCardPreview).toHaveBeenCalledTimes(1);
    expect(target).toHaveAttribute("data-preview-pinned", "false");
  });

  it("accepts pinned state from the main process", () => {
    const showCardPreview = vi.fn(() => Promise.resolve());
    let notifyPinnedChange: ((pinned: boolean) => void) | undefined;
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview: vi.fn(() => Promise.resolve()),
        onCardPreviewPinnedChange: (callback: (pinned: boolean) => void) => {
          notifyPinnedChange = callback;
          return () => undefined;
        }
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    fireEvent.mouseEnter(button);
    act(() => notifyPinnedChange?.(true));

    expect(target).toHaveAttribute("data-preview-pinned", "true");
  });

  it("clears a pinned external preview when the window loses focus", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    fireEvent.mouseEnter(button);
    fireEvent.keyDown(window, { key: "Q", altKey: true });
    fireEvent.blur(window);

    expect(hideCardPreview).toHaveBeenCalledTimes(1);
    expect(target).toHaveAttribute("data-preview-pinned", "false");
  });

  it("cancels the delayed external hide when the pointer returns to the anchor", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 60,
      width: 200,
      height: 40,
      x: 10,
      y: 20,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(target, "matches").mockReturnValue(false);

    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    fireEvent.mouseLeave(button, { clientX: 260, clientY: 40 });
    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    vi.advanceTimersByTime(130);

    expect(hideCardPreview).not.toHaveBeenCalled();
  });

  it("hides after mouseleave even when Electron reports stale coordinates inside the anchor", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    const button = screen.getByRole("button", { name: "火球术" });
    const target = button.closest(".card-hover-target") as HTMLElement;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 60,
      width: 200,
      height: 40,
      x: 10,
      y: 20,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(target, "matches").mockReturnValue(false);

    fireEvent.mouseEnter(button, { clientX: 80, clientY: 40 });
    fireEvent.mouseLeave(button, { clientX: 80, clientY: 40 });
    vi.advanceTimersByTime(130);

    expect(hideCardPreview).toHaveBeenCalledTimes(1);
  });

  it("does not let an inactive preview target hide the active external preview", () => {
    vi.useFakeTimers();
    const showCardPreview = vi.fn(() => Promise.resolve());
    const hideCardPreview = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview
      }
    });
    window.history.pushState({}, "", "/?overlay=1");

    render(
      <>
        <CardHoverPreview details={cardDetails}>
          <button type="button">火球术</button>
        </CardHoverPreview>
        <CardHoverPreview details={{ ...cardDetails, dbfId: 621, name: "炎爆术" }}>
          <button type="button">炎爆术</button>
        </CardHoverPreview>
      </>
    );

    const activeButton = screen.getByRole("button", { name: "火球术" });
    const activeTarget = activeButton.closest(".card-hover-target") as HTMLElement;
    vi.spyOn(activeTarget, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 60,
      width: 200,
      height: 40,
      x: 10,
      y: 20,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(activeTarget, "matches").mockReturnValue(false);

    fireEvent.mouseEnter(activeButton, { clientX: 80, clientY: 40 });
    window.dispatchEvent(new MouseEvent("mouseleave", { clientX: 80, clientY: 40 }));
    vi.advanceTimersByTime(130);

    expect(hideCardPreview).not.toHaveBeenCalled();
  });

  it("shows the Galactic Projection Orb spell history and its empty state in the local preview", () => {
    const projectionOrbDetails: CardDetails = {
      dbfId: 103354,
      cardId: "TOY_378",
      name: "星空投影球",
      manaCost: 10,
      cardType: "法术",
      isSpell: true,
      relatedCards: [],
      playedSpellsThisGame: [
        { dbfId: 1, cardId: "CORE_CS2_024", name: "寒冰箭", manaCost: 2 },
        { dbfId: 1, cardId: "CORE_CS2_024", name: "寒冰箭", manaCost: 2 },
        { dbfId: 2, cardId: "CORE_CATA_009", name: "死神之躯", manaCost: 8 }
      ]
    };
    const { rerender } = render(
      <CardHoverPreview details={projectionOrbDetails}>
        <button type="button">星空投影球</button>
      </CardHoverPreview>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "星空投影球" }));

    const populatedTooltip = screen.getByRole("tooltip");
    expect(populatedTooltip).toHaveTextContent("本局已施放法术（3）");
    expect(within(populatedTooltip).getAllByText(/^(?:寒冰箭|死神之躯)$/).map((item) => item.textContent)).toEqual([
      "寒冰箭",
      "寒冰箭",
      "死神之躯"
    ]);

    rerender(
      <CardHoverPreview details={{ ...projectionOrbDetails, playedSpellsThisGame: [] }}>
        <button type="button">星空投影球</button>
      </CardHoverPreview>
    );

    expect(screen.getByRole("tooltip")).toHaveTextContent("本局还没有施放过法术");
  });

  it("keeps the in-page tooltip outside overlay mode", () => {
    render(
      <CardHoverPreview details={cardDetails}>
        <button type="button">火球术</button>
      </CardHoverPreview>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "火球术" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("造成 6 点伤害。");
  });
});
