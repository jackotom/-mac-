import type {
  MatchFlowLogEvent,
  MatchFlowPhase,
  MatchFlowSnapshot,
  ParsedLogEvent,
  PlayerTurnState
} from "./types.js";

interface MutablePlayerTurnState {
  turn?: number;
  mana?: number;
  manaUsed?: number;
}

export class MatchFlow {
  private globalTurn: number | undefined;
  private activeController: number | undefined;
  private phase: MatchFlowPhase | undefined;
  private readonly players = new Map<number, MutablePlayerTurnState>();
  private readonly playerIdByName = new Map<string, number>();

  constructor(private readonly getFriendlyController: () => number | undefined) {}

  accept(event: ParsedLogEvent) {
    if (event.type === "game-start" || event.type === "game-end") {
      this.clear();
      return;
    }
    if (event.type === "player-identity") {
      this.rememberPlayerIdentity(event.playerId, event.playerName);
      return;
    }
    if (event.type !== "match-flow") {
      return;
    }

    this.applyMatchFlowEvent(event);
  }

  snapshot(): MatchFlowSnapshot | undefined {
    const friendlyController = this.getFriendlyController();
    const friendly = friendlyController === undefined
      ? undefined
      : clonePlayerState(this.players.get(friendlyController));
    const opponentController = friendlyController === undefined
      ? undefined
      : this.resolveOpponentController(friendlyController);
    const opponent = opponentController === undefined
      ? undefined
      : clonePlayerState(this.players.get(opponentController));
    const activeSide = friendlyController === undefined || this.activeController === undefined
      ? undefined
      : this.activeController === friendlyController ? "friendly" as const : "opponent" as const;

    if (
      this.globalTurn === undefined &&
      activeSide === undefined &&
      this.phase === undefined &&
      friendly === undefined &&
      opponent === undefined
    ) {
      return undefined;
    }

    return {
      ...(this.globalTurn !== undefined ? { globalTurn: this.globalTurn } : {}),
      ...(activeSide ? { activeSide } : {}),
      ...(this.phase ? { phase: this.phase } : {}),
      ...(friendly ? { friendly } : {}),
      ...(opponent ? { opponent } : {})
    };
  }

  private applyMatchFlowEvent(event: MatchFlowLogEvent) {
    const controller =
      event.entity.controller ??
      this.resolvePlayerId(event.entity.name) ??
      (isExplicitLocalPlayerName(event.entity.name) ? this.getFriendlyController() : undefined);
    if (event.tag === "TURN") {
      const value = parsePositiveInteger(event.value);
      if (value === undefined) {
        return;
      }
      if (controller === undefined) {
        this.globalTurn = value;
      } else {
        this.updatePlayer(controller, { turn: value });
      }
      return;
    }

    if (event.tag === "STEP" || event.tag === "NEXT_STEP") {
      const phase = resolvePhase(event.value);
      if (phase) {
        this.phase = phase;
      }
      return;
    }

    if (event.tag === "CURRENT_PLAYER") {
      if (controller === undefined || (event.value !== "0" && event.value !== "1")) {
        return;
      }
      if (event.value === "1") {
        this.activeController = controller;
      } else if (this.activeController === controller) {
        this.activeController = undefined;
      }
      return;
    }

    if (controller === undefined) {
      return;
    }

    const value = parseNonNegativeInteger(event.value);
    if (value === undefined) {
      return;
    }
    if (event.tag === "RESOURCES") {
      const current = this.players.get(controller);
      this.updatePlayer(controller, {
        mana: value,
        ...(current?.manaUsed !== undefined && current.manaUsed > value ? { manaUsed: undefined } : {})
      });
      return;
    }

    const current = this.players.get(controller);
    if (current?.mana !== undefined && value > current.mana) {
      this.updatePlayer(controller, { manaUsed: undefined });
      return;
    }
    this.updatePlayer(controller, { manaUsed: value });
  }

  private updatePlayer(controller: number, patch: Partial<MutablePlayerTurnState>) {
    const current = this.players.get(controller) ?? {};
    const next = { ...current, ...patch };
    for (const key of ["turn", "mana", "manaUsed"] as const) {
      if (next[key] === undefined) {
        delete next[key];
      }
    }
    if (Object.keys(next).length > 0) {
      this.players.set(controller, next);
    } else {
      this.players.delete(controller);
    }
  }

  private resolveOpponentController(friendlyController: number) {
    if (this.activeController !== undefined && this.activeController !== friendlyController) {
      return this.activeController;
    }
    return [...this.players.keys()].find((controller) => controller !== friendlyController);
  }

  private rememberPlayerIdentity(playerId: number, playerName: string) {
    const normalized = normalizePlayerName(playerName);
    if (!normalized) {
      return;
    }
    this.playerIdByName.set(normalized, playerId);
    this.playerIdByName.set(normalized.replace(/#\d+$/, ""), playerId);
  }

  private resolvePlayerId(playerName?: string) {
    const normalized = normalizePlayerName(playerName);
    return normalized ? this.playerIdByName.get(normalized) : undefined;
  }

  private clear() {
    this.globalTurn = undefined;
    this.activeController = undefined;
    this.phase = undefined;
    this.players.clear();
    this.playerIdByName.clear();
  }
}

function parseNonNegativeInteger(value: string) {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parsePositiveInteger(value: string) {
  const parsed = parseNonNegativeInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function resolvePhase(value: string): MatchFlowPhase | undefined {
  const normalized = value.toUpperCase();
  if (normalized.includes("MULLIGAN")) {
    return "mulligan";
  }
  if (normalized === "MAIN_READY" || normalized === "MAIN_START") {
    return "start";
  }
  if (normalized === "MAIN_ACTION") {
    return "action";
  }
  if (normalized === "MAIN_END" || normalized === "FINAL_GAMEOVER") {
    return "end";
  }
  return undefined;
}

function clonePlayerState(state: MutablePlayerTurnState | undefined): PlayerTurnState | undefined {
  return state && Object.keys(state).length > 0 ? { ...state } : undefined;
}

function normalizePlayerName(name?: string) {
  const normalized = name?.replace(/\s+/g, " ").trim();
  return normalized && normalized !== "GameEntity" && !normalized.startsWith("UNKNOWN")
    ? normalized
    : undefined;
}

function isExplicitLocalPlayerName(name?: string) {
  const normalized = normalizePlayerName(name);
  return normalized === "本地玩家" || /^LOCAL(?: PLAYER)?$/i.test(normalized ?? "");
}
