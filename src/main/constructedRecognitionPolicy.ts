import type { ArenaState } from "../shared/types.js";

export function shouldRecognizeConstructedDeckScreen(
  arenaStatus: ArenaState["status"],
  activeArenaGame: boolean
): boolean {
  if (arenaStatus === "drafting" || arenaStatus === "redrafting") {
    return false;
  }
  return !activeArenaGame || arenaStatus === "complete";
}
