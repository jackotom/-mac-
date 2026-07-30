import { describe, expect, it } from "vitest";

import { MatchFlow } from "../src/shared/matchFlow";
import type { MatchFlowLogEvent, ParsedLogEvent } from "../src/shared/types";

function flowEvent(
  tag: MatchFlowLogEvent["tag"],
  value: string,
  controller?: number
): MatchFlowLogEvent {
  return {
    type: "match-flow",
    tag,
    value,
    entity: controller === undefined ? {} : { id: String(controller), controller },
    raw: `${tag}=${value}`
  };
}

describe("MatchFlow", () => {
  it("publishes only evidenced turn, side, phase, and mana", () => {
    const flow = new MatchFlow(() => 1);

    flow.accept(flowEvent("TURN", "7"));
    flow.accept(flowEvent("STEP", "MAIN_ACTION"));
    flow.accept(flowEvent("CURRENT_PLAYER", "1", 1));
    flow.accept(flowEvent("TURN", "4", 1));
    flow.accept(flowEvent("RESOURCES", "7", 1));
    flow.accept(flowEvent("RESOURCES_USED", "2", 1));

    expect(flow.snapshot()).toEqual({
      globalTurn: 7,
      activeSide: "friendly",
      phase: "action",
      friendly: { turn: 4, mana: 7, manaUsed: 2 }
    });
  });

  it("keeps partial facts without inventing missing turn or side", () => {
    const flow = new MatchFlow(() => undefined);

    flow.accept(flowEvent("TURN", "9"));
    flow.accept(flowEvent("CURRENT_PLAYER", "1", 2));

    expect(flow.snapshot()).toEqual({ globalTurn: 9 });
  });

  it("resolves player-name tags only after a matching player identity is logged", () => {
    const flow = new MatchFlow(() => 2);
    flow.accept({
      type: "player-identity",
      playerId: 2,
      playerName: "本地玩家#1234",
      raw: "PlayerID=2, PlayerName=本地玩家#1234"
    });
    flow.accept({
      type: "match-flow",
      tag: "CURRENT_PLAYER",
      value: "1",
      entity: { name: "本地玩家" },
      raw: "CURRENT_PLAYER=1"
    });
    flow.accept({
      type: "match-flow",
      tag: "RESOURCES",
      value: "8",
      entity: { name: "本地玩家#1234" },
      raw: "RESOURCES=8"
    });

    expect(flow.snapshot()).toEqual({
      activeSide: "friendly",
      friendly: { mana: 8 }
    });
  });

  it("treats an explicit local-player marker as friendly evidence", () => {
    const flow = new MatchFlow(() => 2);
    flow.accept({
      type: "match-flow",
      tag: "CURRENT_PLAYER",
      value: "1",
      entity: { name: "本地玩家" },
      raw: "CURRENT_PLAYER=1"
    });

    expect(flow.snapshot()).toEqual({ activeSide: "friendly" });
  });

  it("tracks extra turns and consecutive turns for the same player by logged value", () => {
    const flow = new MatchFlow(() => 1);

    flow.accept(flowEvent("CURRENT_PLAYER", "1", 2));
    flow.accept(flowEvent("TURN", "8"));
    flow.accept(flowEvent("TURN", "5", 2));
    flow.accept(flowEvent("TURN", "9"));
    flow.accept(flowEvent("TURN", "6", 2));

    expect(flow.snapshot()).toEqual({
      globalTurn: 9,
      activeSide: "opponent",
      opponent: { turn: 6 }
    });
  });

  it("deduplicates repeated GameState and PowerTaskList facts by idempotent state", () => {
    const flow = new MatchFlow(() => 1);
    const events = [
      flowEvent("TURN", "7"),
      flowEvent("CURRENT_PLAYER", "1", 1),
      flowEvent("RESOURCES", "7", 1),
      flowEvent("RESOURCES_USED", "2", 1)
    ];

    for (const event of [...events, ...events]) {
      flow.accept(event);
    }

    expect(flow.snapshot()).toEqual({
      globalTurn: 7,
      activeSide: "friendly",
      friendly: { mana: 7, manaUsed: 2 }
    });
  });

  it("rejects negative and contradictory mana instead of clamping it", () => {
    const flow = new MatchFlow(() => 1);

    flow.accept(flowEvent("RESOURCES", "7", 1));
    flow.accept(flowEvent("RESOURCES_USED", "8", 1));
    flow.accept(flowEvent("TURN", "-1"));
    flow.accept(flowEvent("TURN", "0"));
    flow.accept(flowEvent("RESOURCES", "-2", 2));

    expect(flow.snapshot()).toEqual({
      friendly: { mana: 7 }
    });
  });

  it("keeps independently logged mana fields when they arrive out of order", () => {
    const flow = new MatchFlow(() => 1);

    flow.accept(flowEvent("RESOURCES_USED", "2", 1));
    expect(flow.snapshot()).toEqual({ friendly: { manaUsed: 2 } });

    flow.accept(flowEvent("RESOURCES", "7", 1));
    expect(flow.snapshot()).toEqual({ friendly: { mana: 7, manaUsed: 2 } });
  });

  it("clears an ended current-player flag and maps trustworthy phase variants", () => {
    const flow = new MatchFlow(() => 1);

    flow.accept(flowEvent("CURRENT_PLAYER", "1", 1));
    flow.accept(flowEvent("NEXT_STEP", "BEGIN_MULLIGAN"));
    expect(flow.snapshot()).toEqual({ activeSide: "friendly", phase: "mulligan" });

    flow.accept(flowEvent("CURRENT_PLAYER", "0", 1));
    flow.accept(flowEvent("STEP", "MAIN_START"));
    expect(flow.snapshot()).toEqual({ phase: "start" });

    flow.accept(flowEvent("STEP", "MAIN_END"));
    expect(flow.snapshot()).toEqual({ phase: "end" });
  });

  it.each([
    { type: "game-start", raw: "CREATE_GAME" },
    { type: "game-end", raw: "FINAL_GAMEOVER" }
  ] satisfies ParsedLogEvent[])("clears all flow facts on $type", (resetEvent) => {
    const flow = new MatchFlow(() => 1);
    flow.accept(flowEvent("TURN", "7"));
    flow.accept(flowEvent("CURRENT_PLAYER", "1", 1));

    flow.accept(resetEvent);

    expect(flow.snapshot()).toBeUndefined();
  });
});
