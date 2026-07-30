import type { MatchFlowSnapshot, PlayerTurnState, PublicTrackerState } from "../shared/types";
import type { MatchPulseView } from "./types";

export function toMatchPulseViewFromState(state: PublicTrackerState): MatchPulseView | undefined {
  return toMatchPulseView(state.matchFlow);
}

export function toMatchPulseView(source: MatchFlowSnapshot | undefined): MatchPulseView | undefined {
  if (!source) return undefined;

  const turn = trustedPositiveInteger(source.globalTurn);
  const activeSide = source.activeSide === "friendly" || source.activeSide === "opponent"
    ? source.activeSide
    : undefined;
  const mana = activeSide ? trustedMana(source[activeSide]) : undefined;
  const fullParts = [
    turn === undefined ? undefined : `第${turn}回合`,
    activeSide === "friendly" ? "我方行动" : activeSide === "opponent" ? "对手行动" : undefined,
    mana ? `法力${mana.available}/${mana.maximum}` : undefined
  ].filter(isText);
  const compactParts = [
    turn === undefined ? undefined : `${turn}回`,
    activeSide === "friendly" ? "我" : activeSide === "opponent" ? "敌" : undefined,
    mana ? `${mana.available}/${mana.maximum}` : undefined
  ].filter(isText);
  const actorLabel = activeSide === "friendly"
    ? "我方回合"
    : activeSide === "opponent"
      ? "对手回合"
      : undefined;

  if (fullParts.length === 0 && compactParts.length === 0 && actorLabel === undefined) {
    return undefined;
  }

  return {
    ...(turn === undefined ? {} : { turn }),
    ...(activeSide === undefined ? {} : { activeSide }),
    ...(fullParts.length === 0 ? {} : { fullLabel: fullParts.join(" · ") }),
    ...(compactParts.length === 0 ? {} : { compactLabel: compactParts.join(" · ") }),
    ...(actorLabel === undefined ? {} : { actorLabel })
  };
}

function trustedMana(
  player: PlayerTurnState | undefined
): { readonly available: number; readonly maximum: number } | undefined {
  const maximum = trustedNonNegativeInteger(player?.mana);
  const used = trustedNonNegativeInteger(player?.manaUsed);
  if (maximum === undefined || used === undefined || used > maximum) return undefined;
  return { available: maximum - used, maximum };
}

function trustedPositiveInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function trustedNonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && (value ?? -1) >= 0 ? value : undefined;
}

function isText(value: string | undefined): value is string {
  return value !== undefined;
}
