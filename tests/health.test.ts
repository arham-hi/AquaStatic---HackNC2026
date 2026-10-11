import { afterEach, describe, expect, it, vi } from "vitest";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ execute }) }));
vi.mock("@/lib/env", () => ({ env: { demoMode: false }, hasGemini: () => false, hasElevenLabs: () => false, hasPhoton: () => false }));
const { GET } = await import("@/app/api/health/route");
afterEach(() => { vi.restoreAllMocks(); execute.mockReset(); });

describe("health endpoint", () => {
  it("queries the database before reporting success", async () => {
    execute.mockResolvedValueOnce([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
    expect((await response.json()).database).toBe("connected");
  });
  it("returns a safe failure without exposing database credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    execute.mockRejectedValueOnce(new Error("postgres://user:private-password@example.com/db"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-password");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-password");
  });
});
