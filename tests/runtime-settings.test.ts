import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";
import { dataDirectory } from "@/lib/data-dir";
import { reserveChars } from "@/lib/voice/budget";

afterEach(() => vi.unstubAllEnvs());
describe("deployment settings", () => {
  it("uses writable temporary storage on Vercel and respects an explicit override", () => {
    vi.stubEnv("DATA_DIR", ""); vi.stubEnv("VERCEL", "1");
    expect(dataDirectory()).toBe(path.join(tmpdir(), "aqua"));
    vi.stubEnv("DATA_DIR", "custom-cache");
    expect(dataDirectory()).toBe("custom-cache");
  });
  it("accepts a zero voice reserve and safely defaults invalid values", () => {
    vi.stubEnv("ELEVENLABS_RESERVE_CHARS", "0");
    expect(reserveChars()).toBe(0);
    vi.stubEnv("ELEVENLABS_RESERVE_CHARS", "not-a-number");
    expect(reserveChars()).toBe(3000);
    vi.stubEnv("ELEVENLABS_RESERVE_CHARS", "");
    expect(reserveChars()).toBe(3000);
  });
});
