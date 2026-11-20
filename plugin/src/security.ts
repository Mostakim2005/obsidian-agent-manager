import * as crypto from "node:crypto";

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const h = hostHeader.trim().toLowerCase();
  return (
    h === `127.0.0.1:${port}` ||
    h === `localhost:${port}` ||
    h === `[::1]:${port}` ||
    h === "127.0.0.1" ||
    h === "localhost" ||
    h === "[::1]"
  );
}

export function normalizeSafeVaultPath(rawPath: string): string {
  if (typeof rawPath !== "string" || rawPath.includes("\0")) {
    throw new Error(`Invalid vault path: ${String(rawPath)}`);
  }
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Invalid vault path: ${rawPath}`);
  }
  const segments = normalized.split("/");
  if (segments.some((seg) => seg === ".." || seg === ".")) {
    throw new Error(`Invalid vault path: ${rawPath}`);
  }
  if (segments[0]?.toLowerCase() === ".obsidian") {
    throw new Error(`Access to .obsidian config directory is forbidden: ${rawPath}`);
  }
  return normalized;
}
