import { describe, expect, it } from "vitest";
import { clamp01, followVoice, rmsToVoice, speechClockTarget } from "@/components/radio/voice-level";

describe("rmsToVoice", () => {
  it("gates silence and room tone to zero", () => {
    expect(rmsToVoice(0)).toBe(0);
    expect(rmsToVoice(0.01)).toBe(0);
    expect(rmsToVoice(0.014)).toBe(0);
  });

  it("opens clearly for ordinary speech and saturates on loud speech", () => {
    expect(rmsToVoice(0.06)).toBeGreaterThan(0.25);
    expect(rmsToVoice(0.15)).toBeGreaterThan(0.55);
    expect(rmsToVoice(0.5)).toBe(1);
  });

  it("is monotonic — louder input means a wider mouth", () => {
    let prev = 0;
    for (const r of [0.02, 0.05, 0.1, 0.2, 0.4]) {
      const v = rmsToVoice(r);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe("speechClockTarget", () => {
  it("produces movement while speaking, including near-closed beats", () => {
    let max = 0;
    let min = 1;
    for (let i = 40; i < 400; i++) {
      const v = speechClockTarget(0, i * 16.7);
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    expect(max).toBeGreaterThan(0.5);
    expect(min).toBeLessThan(0.35);
  });

  it("bumps on a word boundary", () => {
    const now = 5000;
    expect(speechClockTarget(now, now)).toBeGreaterThan(0.4);
  });
});

describe("followVoice", () => {
  it("attacks fast and releases slow while speaking", () => {
    expect(followVoice(0, 1, true)).toBeCloseTo(0.55, 5);
    expect(followVoice(1, 0, true)).toBeCloseTo(0.84, 5);
  });

  it("settles to rest quickly once speech stops", () => {
    expect(followVoice(0.8, 0, false)).toBeCloseTo(0.4, 5);
    let v = 0.8;
    for (let i = 0; i < 12; i++) v = followVoice(v, 0, false);
    expect(v).toBe(0);
  });
});

describe("clamp01", () => {
  it("clamps to the 0..1 range", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(3)).toBe(1);
  });
});
