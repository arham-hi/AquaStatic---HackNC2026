// Critical user flows against a fresh database (see playwright.config.ts → scripts/e2e-server.mjs).
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function switchDemo(page: Page, userId: string) {
  const r = await page.request.post("/api/demo/switch", { data: { userId } });
  expect(r.ok()).toBeTruthy();
}
async function reset(req: APIRequestContext) {
  const r = await req.post("/api/demo/reset");
  expect(r.ok()).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test("homepage loads the 3D map with demo markers and live counts", async ({ page, request }) => {
  await reset(request);
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening|night), Carolina/ })).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".marker").first()).toBeVisible({ timeout: 30000 });
  expect(await page.locator(".marker").count()).toBeGreaterThan(5);
  await expect(page.getByText(/happening on campus right now/)).toBeVisible();
});

test("navigates major pages without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, heading] of [["/connect", "Connect"], ["/radio", "Aqua Static Radio"], ["/messages", "Messages"], ["/notifications", "Notifications"], ["/profile", "Profile"], ["/developer", "Demo & integrations"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(heading) })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("two users: request → offer → match → accept both → chat → complete; assistant + radio reflect it", async ({ browser, request }) => {
  await reset(request);
  const maya = await browser.newContext();
  const jordan = await browser.newContext();
  const pm = await maya.newPage();
  const pj = await jordan.newPage();
  await switchDemo(pm, "u_demo_maya");
  await switchDemo(pj, "u_demo_jordan");

  // Maya creates a request through the natural-language dialog.
  await pm.goto("/connect");
  await pm.getByRole("button", { name: "Request help" }).click();
  const ta = pm.getByPlaceholder(/e\.g\./);
  await ta.fill("Need a USB-C laptop charger at Davis Library for the next hour.");
  await pm.getByRole("button", { name: "Interpret" }).click();
  await expect(pm.getByText("Review your post")).toBeVisible();
  await expect(pm.getByText("Davis Library")).toBeVisible();
  await pm.getByRole("button", { name: "Publish" }).click();
  await expect(pm.getByText(/Posted: Need a USB-C laptop charger/)).toBeVisible({ timeout: 15000 });

  // Jordan sees it appear without reloading, then offers.
  await pj.goto("/connect");
  await expect(pj.getByText("Need a USB-C laptop charger at Davis Library").first()).toBeVisible({ timeout: 15000 });
  await pj.getByRole("button", { name: "Offer help" }).click();
  await pj.getByPlaceholder(/e\.g\./).fill("I have an extra USB-C laptop charger at Davis until 5.");
  await pj.getByRole("button", { name: "Interpret" }).click();
  await pj.getByRole("button", { name: "Publish" }).click();
  await expect(pj.getByText(/We found 1 possible match/)).toBeVisible({ timeout: 15000 });

  // Both see the suggested match and accept; chat opens in a sheet.
  await expect(pj.getByText("Potential match").first()).toBeVisible({ timeout: 15000 });
  await pj.getByRole("button", { name: "Accept" }).first().click();
  await expect(pj.getByText(/You accepted/)).toBeVisible();

  await pm.goto("/connect");
  await expect(pm.getByText(/already accepted/)).toBeVisible({ timeout: 15000 });
  await pm.getByRole("button", { name: "Accept" }).first().click();
  await expect(pm.getByRole("dialog", { name: "Chat" })).toBeVisible({ timeout: 15000 });

  // Chat.
  await pm.getByPlaceholder(/message/i).fill("Hey Jordan! 3rd floor by the windows.");
  await pm.keyboard.press("Enter");
  await expect(pm.getByText("Hey Jordan! 3rd floor by the windows.")).toBeVisible();
  await pj.goto("/connect");
  await pj.getByRole("button", { name: "Open chat" }).first().click();
  await expect(pj.getByText("Hey Jordan! 3rd floor by the windows.")).toBeVisible({ timeout: 15000 });
  await pj.getByPlaceholder(/message/i).fill("On my way up.");
  await pj.keyboard.press("Enter");
  await expect(pm.getByText("On my way up.")).toBeVisible({ timeout: 15000 });

  // Notifications reflect the flow.
  await pm.goto("/notifications");
  await expect(pm.getByText(/connected|accepted|match/i).first()).toBeVisible();

  // Assistant is grounded in the stored request.
  await pm.goto("/map");
  await pm.getByRole("button", { name: "Ask a question" }).click();
  await pm.getByPlaceholder("Ask anything about campus…").fill("What help requests are there around Davis Library?");
  await pm.keyboard.press("Enter");
  await expect(pm.getByText(/USB-C laptop charger/).first()).toBeVisible({ timeout: 20000 });

  // Radio briefing mentions the new activity and labels demo data.
  await pm.goto("/radio/studio");
  await pm.getByRole("button", { name: /^Generate Campus Radio$/ }).click();
  await expect(pm.getByText(/Includes demo data/).first()).toBeVisible({ timeout: 30000 });
  await expect(pm.getByRole("tab", { name: /Transcript/ })).toBeVisible();
  await pm.getByRole("tab", { name: /Transcript/ }).click();
  await expect(pm.getByText(/charger/i).first()).toBeVisible();

  await maya.close();
  await jordan.close();
});

test("radio station: Aqua greets, then announces a real new post", async ({ page, request }) => {
  await reset(request);
  await switchDemo(page, "u_demo_maya");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/radio");
  await expect(page.getByRole("heading", { level: 1, name: "Aqua Static Radio" })).toBeVisible();
  const mascot = page.locator("[data-mascot-state]");
  await expect(mascot).toBeVisible();
  await expect(page.getByText("Chapel Hill's campus, live. Tap to tune in.")).toBeVisible();

  await page.getByRole("button", { name: /^Tune in$/ }).click();
  // A real segment plays (TTS or the text fallback in headless CI) → talking state + quoted transcript.
  await expect(page.getByText("Aqua is speaking").first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('section[aria-label="Now on air"]')).toContainText(/“/);

  // A new campus post lands mid-broadcast and the station picks it up.
  const tPost = Date.now();
  const pr = await page.request.post("/api/posts", {
    data: { title: "Lost keys near the Bell Tower", description: "Lost keys near the Bell Tower — reward if found", type: "request", category: "lost_found", locationId: "bell-tower", expiry: "3h" },
  });
  expect(pr.status()).toBe(201);
  await expect(page.locator('section[aria-label="Recent segments"]')).toContainText(/keys|Bell Tower/i, { timeout: 30000 });
  console.log(`[station] post → segment on air: ${Date.now() - tPost}ms`);
  await expect(page.locator('section[aria-label="Recent segments"]').getByText(/demo/i).first()).toBeVisible();

  // Mute silences output and is clearly labeled; unmute returns to the live state.
  await page.getByRole("button", { name: "Mute" }).click();
  await expect(page.getByText("Muted").first()).toBeVisible();
  await expect(mascot).toHaveAttribute("data-mascot-state", "muted");
  await page.getByRole("button", { name: "Unmute" }).click();
  await expect(mascot).not.toHaveAttribute("data-mascot-state", "muted");

  // Skip advances the queue without breaking the station.
  const skipBtn = page.getByRole("button", { name: "Skip segment" });
  if (await skipBtn.isEnabled()) {
    await skipBtn.click();
    await expect(page.getByText(/Aqua is speaking|Music playing/i).first()).toBeVisible({ timeout: 15000 });
  }
  expect(errors).toEqual([]);
});

test("live call: Call Aqua greets, answers a typed turn, and restores the radio", async ({ page, request }) => {
  await reset(request);
  await switchDemo(page, "u_demo_maya");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Seed a real post for the call to find.
  const pr = await page.request.post("/api/posts", {
    data: { title: "Need a USB-C charger at Davis", description: "Need a USB-C laptop charger at Davis Library", type: "request", category: "borrowing", locationId: "davis-library", expiry: "3h" },
  });
  expect(pr.status()).toBe(201);

  await page.goto("/radio");
  await page.getByRole("button", { name: /^Tune in$/ }).click();
  await page.getByRole("button", { name: "Call Aqua" }).click();

  const call = page.locator('section[aria-label="Live call with Aqua"]');
  await expect(call).toBeVisible();
  await expect(call.getByText("AI host", { exact: true })).toBeVisible();
  await expect(call.getByText(/Private call/)).toBeVisible();
  await expect(call.getByText(/not a person/)).toBeVisible();

  // Station controls park while the call runs.
  await expect(page.getByText(/On a call — the station is parked/)).toBeVisible();

  // Aqua greets aloud — the greeting lands in the transcript and the mascot is in a call state.
  await expect(call.getByText(/Who do I have on the line/)).toBeVisible({ timeout: 20000 });
  const mascotState = await page.locator("[data-mascot-state]").getAttribute("data-mascot-state");
  expect(["tuning", "talking", "thinking", "listening"]).toContain(mascotState);

  // Headless CI has no mic — the typed path proves the same conversation loop.
  const input = call.getByLabel("Type a message to Aqua");
  await expect(input).toBeEnabled({ timeout: 25000 }); // enabled once greeting/thinking clears
  await input.fill("any charger requests?");
  await call.getByRole("button", { name: "Send message" }).click();
  await expect(call).toContainText(/charger/i, { timeout: 20000 });
  await expect(call.getByText(/From the board/)).toBeVisible(); // grounded source card

  // End call → goodbye, then the radio controls come back.
  await call.getByRole("button", { name: "End call" }).click();
  await expect(page.getByRole("button", { name: "Call Aqua" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Music playing|Aqua is speaking|Muted/i).first()).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
});

test("old transit links open the live map's bus overlay with schedule data and the official tracker", async ({ page }) => {
  await page.goto("/transit");
  await expect(page).toHaveURL(/\/map\?buses=1/);
  await expect(page.getByRole("complementary", { name: "Bus routes and stops" })).toBeVisible();
  await expect(page.getByText(/schedule data|demo route geometry/i).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("link", { name: /official tracker|mychtransit/i }).first()).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30000 });
});

test("connect stream: filter to help, open a card, save it", async ({ page, request }) => {
  await reset(request);
  await switchDemo(page, "u_demo_maya");
  await page.goto("/connect");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const first = page.locator("article").first();
  await expect(first).toBeVisible({ timeout: 15000 });
  await first.click();
  await page.getByRole("dialog").getByRole("button", { name: /^Save$/ }).click();
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
});
