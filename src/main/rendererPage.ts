export function resolveTrustedDevServerUrl(
  devServerUrl: string | undefined,
  isPackaged: boolean,
  query: Readonly<Record<string, string>> = {}
): string | undefined {
  if (isPackaged || !devServerUrl) return undefined;
  const url = new URL(devServerUrl);
  const trustedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    url.protocol !== "http:" ||
    !trustedHosts.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("VITE_DEV_SERVER_URL 必须是无账号信息的本机开发地址。");
  }
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
