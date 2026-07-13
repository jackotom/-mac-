import type { CardLibraryQuery } from "./types";

export function selectVisibleNotice(initializationError?: string, liveError?: string, notice?: string) {
  if (initializationError) return { message: initializationError, role: "alert" as const };
  if (liveError) return { message: liveError, role: "alert" as const };
  if (notice) return { message: notice, role: "status" as const };
  return undefined;
}

export function shouldRequestCardLibrary(previous: CardLibraryQuery | undefined, next: CardLibraryQuery): boolean {
  return !previous || previous.query !== next.query || previous.heroClass !== next.heroClass ||
    previous.cardType !== next.cardType || previous.page !== next.page || previous.pageSize !== next.pageSize;
}

export function createSynchronousActionLock() {
  let locked = false;
  return {
    run<T>(task: () => Promise<T>): Promise<T> | undefined {
      if (locked) return undefined;
      locked = true;
      return task().finally(() => { locked = false; });
    },
    isLocked: () => locked
  };
}
