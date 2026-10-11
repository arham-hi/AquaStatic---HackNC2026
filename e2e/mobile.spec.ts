import { test, expect } from "@playwright/test";

test("mobile layout: bottom nav, map, no horizontal overflow, create dialog usable", async ({ page }) => {
  for (const path of ["/", "/discover", "/connect", "/radio", "/transit", "/messages", "/profile"]) {
    await page.goto(path);
    // Live polling and SSE intentionally keep network connections open.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `${path} overflows horizontally`).toBe(false);
  }
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("button", { name: "Create a post" }).click();
  await expect(page.getByText("What's happening?")).toBeVisible();
});
