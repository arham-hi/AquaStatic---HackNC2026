import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/env", () => ({ env: { authSecret: "session-test-secret-at-least-32-chars", isProd: false } }));
const { encodeSession, decodeSession } = await import("@/lib/session");
const secret = "session-test-secret-at-least-32-chars";
const signed = (payload: unknown) => {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
};
afterEach(() => vi.useRealTimers());

describe("signed session lifetime", () => {
  it("accepts a valid session and rejects tampering or extra token parts", () => {
    const token = encodeSession("u_test");
    expect(decodeSession(token)?.uid).toBe("u_test");
    expect(decodeSession(`${token}extra`)).toBeNull();
    expect(decodeSession(`${token}.extra`)).toBeNull();
  });
  it("rejects expired and future-dated sessions even with valid signatures", () => {
    expect(decodeSession(signed({ uid: "u_test", iat: Date.now() - 91 * 86400000 }))).toBeNull();
    expect(decodeSession(signed({ uid: "u_test", iat: Date.now() + 3600000 }))).toBeNull();
    expect(decodeSession(signed({ uid: "u_test" }))).toBeNull();
  });
});
