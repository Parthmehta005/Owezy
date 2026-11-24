import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

/** Asha's group with one expense she paid (she gets back ₹600), open on her phone. */
async function openGroup(browser: import("@playwright/test").Browser, testInfo: import("@playwright/test").TestInfo, tag: string, reduce: boolean) {
  const asha = await createDevUser(tag, "Asha");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  const ids = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  await asha.api.rpc("create_expense", {
    group_id: groupId, description: "Dinner", payer_member_id: ids.Asha, total_paise: 120000, split_type: "equal",
    shares: { [ids.Asha]: 60000, [ids.Rahul]: 60000 },
  });
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();
  if (reduce) await page.emulateMedia({ reducedMotion: "reduce" });
  const hydrated = page.waitForRequest((r) => r.url().includes("/rest/v1/rpc/record_group_open"));
  await page.goto(`/g/${groupId}`);
  await hydrated;
  await expect(page.getByTestId("summary-total")).toHaveText("₹600");
  return { context, page };
}

/** Add a ₹2,000 expense Asha paid (she lends ₹1,000 more) and record every value the total shows on the way. */
async function addAndWatchTotal(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="summary-total"]')!;
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.keyboard.type("2000");
  await page.getByLabel("What was it for?").fill("Villa");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("summary-total")).toHaveText("₹1,600");
  await page.waitForTimeout(600);
  return page.evaluate(() => (window as unknown as { seen: string[] }).seen);
}

test("the total counts to its new value", async ({ browser }, testInfo) => {
  const { context, page } = await openGroup(browser, testInfo, "motion-on", false);
  const seen = await addAndWatchTotal(page);
  expect(new Set(seen).size).toBeGreaterThan(2); // passed through values in between
  expect(seen.at(-1)).toBe("₹1,600");
  await context.close();
});

test("with reduce motion, nothing slides or counts", async ({ browser }, testInfo) => {
  const { context, page } = await openGroup(browser, testInfo, "motion-off", true);
  const seen = await addAndWatchTotal(page);
  expect([...new Set(seen)]).toEqual(["₹1,600"]); // straight to the answer
  const duration = await page.getByTestId("expense-row").first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
  await context.close();
});
