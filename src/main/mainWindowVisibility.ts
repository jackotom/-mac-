export function shouldShowMainWindowOnLaunch(environment: Readonly<Record<string, string | undefined>>) {
  const capturesMainWindow = Boolean(environment.QA_SCREENSHOT_PATH || environment.QA_INSPECT_PATH);
  const capturesAnotherWindow =
    environment.QA_OPEN_OVERLAY === "1" ||
    environment.QA_OPEN_OPPONENT_OVERLAY === "1" ||
    environment.QA_OPEN_ARENA_CHOICE_OVERLAY === "1" ||
    environment.QA_OPEN_BOARD_ATTACK_OVERLAY === "1";
  return capturesMainWindow && environment.QA_EXIT_AFTER_SCREENSHOT === "1" && !capturesAnotherWindow;
}

export function shouldHandleAppActivate(
  initialBackgroundWindowReady: boolean,
  initialLaunchActivateObserved: boolean,
  nowMs: number,
  userActivationAllowedAfterMs: number
) {
  return (
    initialBackgroundWindowReady &&
    (initialLaunchActivateObserved || nowMs >= userActivationAllowedAfterMs)
  );
}
