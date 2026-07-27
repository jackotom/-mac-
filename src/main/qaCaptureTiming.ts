export type QaJavaScriptExecutor = (script: string) => Promise<unknown>;

export function requestQaQuit(quit: () => void): Promise<never> {
  quit();
  return new Promise<never>(() => undefined);
}

export async function waitForQaRendererSettled(
  executeJavaScript: QaJavaScriptExecutor,
  timeoutMs = 1_000
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  await Promise.race([
    executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))"),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    })
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
