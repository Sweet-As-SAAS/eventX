// Sarah's golden path under MOCK=1: Describe → Details → Questions → Documents (fix the red item) → Site plan →
// Deadlines (dates, PDF, reminder, Eventbrite draft) → Home. Selectors are role + visible text, tolerant of restyling.
// A step that can't find its element is recorded and the walk carries on, so one run reports every broken selector.
import { expect, test } from "@playwright/test";
import fixture from "../fixtures/demo-event.json";

const SHOTS = "reports/screenshots";
const STEP_TIMEOUT = 10_000;

test("golden path", async ({ page }, info) => {
  const failures: string[] = [];
  let n = 0;
  const shot = async (screen: string) => {
    n += 1;
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(700); // let entrance animations settle, or the shot catches them half faded
    await page.screenshot({ path: `${SHOTS}/${String(n).padStart(2, "0")}-${screen}-${info.project.name}.png`, fullPage: true });
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    await test.step(name, async () => {
      try { await fn(); } catch (e) { failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`); }
    });
  };
  // If a click didn't navigate, go straight to the screen so later steps still run.
  const ensureAt = async (path: RegExp, url: string) => {
    if (!path.test(new URL(page.url()).pathname)) await page.goto(url);
  };
  const id = "demo"; // MOCK createEvent always returns { id: "demo" }

  // 0. Landing: the hero previews the demo event
  await page.goto("/");
  await page.waitForTimeout(1500); // the hero's highlight sweep
  await page.screenshot({ path: `${SHOTS}/00-landing-${info.project.name}.png`, fullPage: true });

  // 1. Describe
  await page.goto("/new");
  await step("describe: type the description", async () => {
    const box = page.getByRole("textbox", { name: /your event, in your words|what.?s happening|describe/i }).first();
    await box.fill(fixture.description, { timeout: STEP_TIMEOUT });
  });
  await shot("describe");
  await step("describe: submit", async () => {
    await page.getByRole("button", { name: /check my event|start|continue/i }).first().click({ timeout: STEP_TIMEOUT });
    await page.waitForURL(/\/events\/[^/]+\/profile/, { timeout: STEP_TIMEOUT });
  });

  // 2. Details (profile)
  await ensureAt(/\/profile$/, `/events/${id}/profile`);
  await step("details: event name shown", async () => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(fixture.profile.name.value, { timeout: STEP_TIMEOUT });
  });
  await shot("details");
  await step("details: confirm", async () => {
    await page.getByRole("button", { name: /looks right|confirm|continue/i }).first().click({ timeout: STEP_TIMEOUT });
    await page.waitForURL(/\/(questions|documents)$/, { timeout: STEP_TIMEOUT });
  });

  // 3. Questions: tap one answer
  await ensureAt(/\/questions$/, `/events/${id}/questions`);
  const [question] = fixture.questions;
  await step("questions: tap an answer", async () => {
    const answer = page.getByRole("button", { name: new RegExp(`^${question.options[1]}$`, "i") });
    await answer.click({ timeout: STEP_TIMEOUT });
    await expect(answer).toHaveAttribute("aria-pressed", "true", { timeout: STEP_TIMEOUT });
  });
  await shot("questions");
  await step("questions: continue", async () => {
    await page.getByRole("button", { name: /continue|documents|next/i }).first().click({ timeout: STEP_TIMEOUT });
    await page.waitForURL(/\/documents$/, { timeout: STEP_TIMEOUT });
  });

  // 4. Documents: the red item, Fix, turns green
  await ensureAt(/\/documents$/, `/events/${id}/documents`);
  const fixButton = page.getByRole("button", { name: /^fix/i }).first();
  await step("documents: red item has a Fix button", async () => {
    await expect(fixButton).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(page.getByText(/to fix|needs? (a )?fix/i).first()).toBeVisible({ timeout: STEP_TIMEOUT });
  });
  await shot("documents-red");
  await step("documents: click Fix, item turns green", async () => {
    await fixButton.click({ timeout: STEP_TIMEOUT });
    // "Fix it" either fixes in one click or opens the item, where "Apply fix" / "Add to draft" finishes it.
    const apply = page.getByRole("button", { name: /apply fix|add to draft/i }).first();
    if (await apply.waitFor({ timeout: 2_000 }).then(() => true, () => false)) {
      const answerBox = page.getByRole("textbox").filter({ visible: true }).first(); // facts EvntX must not invent
      if (await answerBox.isVisible()) await answerBox.fill("The open lawn north of the main gate");
      await apply.click({ timeout: STEP_TIMEOUT });
    }
    await expect(page.getByRole("button", { name: /^fix/i })).toHaveCount(0, { timeout: STEP_TIMEOUT });
    await expect(page.getByText(/to fix/i)).toHaveCount(0, { timeout: STEP_TIMEOUT });
  });
  await shot("documents-green");
  await step("documents: continue to site plan", async () => {
    await page.getByRole("link", { name: /site plan|continue/i }).last().click({ timeout: STEP_TIMEOUT });
    await page.waitForURL(/\/site-plan$/, { timeout: STEP_TIMEOUT });
  });

  // 5. Site plan (owned by a teammate: only look, never interact beyond continuing)
  await ensureAt(/\/site-plan$/, `/events/${id}/site-plan`);
  await shot("site-plan");
  await step("site plan: continue to deadlines", async () => {
    await page.getByRole("link", { name: /deadlines|continue/i }).last().click({ timeout: STEP_TIMEOUT });
    await page.waitForURL(/\/deadlines$/, { timeout: STEP_TIMEOUT });
  });

  // 6. Deadlines: engine dates, PDF, reminder, Eventbrite draft
  await ensureAt(/\/deadlines$/, `/events/${id}/deadlines`);
  await step("deadlines: special licence recommended 29 Jan 2027", async () => {
    await expect(page.getByText(/29 Jan/).first()).toBeVisible({ timeout: STEP_TIMEOUT });
  });
  await step("deadlines: special licence legal minimum 15 Feb 2027", async () => {
    await expect(page.getByText(/15 Feb(ruary)? 2027/).first()).toBeVisible({ timeout: STEP_TIMEOUT });
  });
  await shot("deadlines");
  await step("deadlines: PDF download succeeds", async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("link", { name: /pdf/i }).first().click({ timeout: STEP_TIMEOUT }),
    ]);
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
  await step("deadlines: send reminder", async () => {
    await page.getByRole("button", { name: /remind/i }).first().click({ timeout: STEP_TIMEOUT });
    await expect(page.getByText(/sent/i).first()).toBeVisible({ timeout: STEP_TIMEOUT });
  });
  await step("deadlines: Eventbrite draft link appears", async () => {
    await page.getByRole("button", { name: /eventbrite/i }).first().click({ timeout: STEP_TIMEOUT });
    await expect(page.getByRole("link", { name: /eventbrite draft/i })).toHaveAttribute("href", /eventbrite\.com/, { timeout: STEP_TIMEOUT });
  });
  await shot("deadlines-done");

  // 7. Home / dashboard
  await page.goto("/dashboard");
  await step("home: the event is listed", async () => {
    await expect(page.getByText(fixture.profile.name.value).filter({ visible: true }).first()).toBeVisible({ timeout: STEP_TIMEOUT });
  });
  await shot("home");

  expect(failures, `Steps that failed:\n${failures.join("\n")}`).toEqual([]);
});
