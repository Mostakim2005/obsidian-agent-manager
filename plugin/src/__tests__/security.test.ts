import { describe, expect, it } from "vitest";
import { constantTimeEquals, isAllowedHost, normalizeSafeVaultPath } from "../security";

describe("security helpers", () => {
  it("compares tokens in constant time", () => {
    expect(constantTimeEquals("Bearer abc123", "Bearer abc123")).toBe(true);
    expect(constantTimeEquals("Bearer abc123", "Bearer abc124")).toBe(false);
    expect(constantTimeEquals("short", "longer-token")).toBe(false);
  });

  it("allows loopback Host headers and blocks DNS rebinding hosts", () => {
    expect(isAllowedHost("127.0.0.1:27125", 27125)).toBe(true);
    expect(isAllowedHost("localhost:27125", 27125)).toBe(true);
    expect(isAllowedHost("evil.example:27125", 27125)).toBe(false);
    expect(isAllowedHost("127.0.0.1:9999", 27125)).toBe(false);
  });

  it("rejects path traversal in vault note paths", () => {
    expect(normalizeSafeVaultPath("EE/Circuits/Lab1.md")).toBe("EE/Circuits/Lab1.md");
    expect(() => normalizeSafeVaultPath("../secret.md")).toThrow();
    expect(() => normalizeSafeVaultPath("notes/../../etc/passwd")).toThrow();
  });
});
