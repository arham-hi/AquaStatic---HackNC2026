import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  hasGemini: () => true,
  env: { gemini: { apiKey: "test-key", model: "gemini-3.8-flash" } },
}));
vi.mock("@/lib/ai/gemini", async (original) => ({
  ...await original<typeof import("@/lib/ai/gemini")>(),
  generateJson: vi.fn(),
}));

import { generateJson } from "@/lib/ai/gemini";
import { composeAnswer } from "@/lib/ai";

afterEach(() => { vi.mocked(generateJson).mockReset(); vi.restoreAllMocks(); });

describe("assistant Gemini fallback", () => {
  it("returns a local fallback when the provider fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateJson).mockRejectedValue(new Error("Service unavailable"));
    expect(await composeAnswer("What is happening?", [])).toBeNull();
    expect(warning).toHaveBeenCalled();
  });

  it("returns a recovered Gemini answer without labeling it as fallback", async () => {
    const answer = { answer: "No verified events were found.", citedIds: [] };
    vi.mocked(generateJson).mockResolvedValue(answer);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await composeAnswer("What is happening?", [])).toEqual(answer);
    expect(warning).not.toHaveBeenCalled();
  });
});
