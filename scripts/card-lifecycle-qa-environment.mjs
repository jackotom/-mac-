const developmentEntryKeys = new Set([
  "VITE_DEV_SERVER_URL",
  "ELECTRON_RUN_AS_NODE"
]);

export function createNodeEnvironmentUnsetArguments(baseEnvironment) {
  return Object.keys(baseEnvironment)
    .filter((key) => /^NODE_/.test(key))
    .sort()
    .flatMap((key) => ["-u", key]);
}

export function createChildEnvironment(
  baseEnvironment,
  extraEnvironment,
  userData,
  isolatedPowerLog,
  inspectPath
) {
  const cleanEnvironment = Object.fromEntries(
    Object.entries(baseEnvironment).filter(([key]) =>
      !/^QA_/.test(key) &&
      !/^NODE_/.test(key) &&
      !/^VITE_/.test(key) &&
      !developmentEntryKeys.has(key)
    )
  );
  return {
    ...cleanEnvironment,
    ...extraEnvironment,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    HEARTHSTONE_LOG_DIR: userData,
    QA_ALLOW_MULTIPLE_INSTANCES: "1",
    QA_SKIP_LOG_CONFIG_REPAIR: "1",
    QA_SKIP_ARENA_SCREEN_RECOGNITION: "1",
    QA_LOCK_LOG_PATH: "1",
    QA_START_TRACKING: "0",
    QA_USER_DATA_DIR: userData,
    QA_LOG_PATH: isolatedPowerLog,
    QA_INSPECT_PATH: inspectPath,
    QA_EXIT_AFTER_SCREENSHOT: "1"
  };
}
