import * as crypto from "node:crypto";

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return true;
  const h = hostHeader.trim().toLowerCase();
  return (
    h === `127.0.0.1:${port}` ||
    h === `localhost:${port}` ||
    h === `[::1]:${port}` ||
    h === "127.0.0.1" ||
    h === "localhost"
  );
}

export function normalizeSafeVaultPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error(`Invalid vault path: ${rawPath}`);
  }
  return normalized;
}
