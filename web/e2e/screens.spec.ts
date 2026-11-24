import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, passVercelProtection, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, type DevUser } from "./support/dev-users";

/**
 * Screenshot tests of the key screens, in light and dark mode, on both
 * engines. They fail if a screen changes by more than a sliver, so a visual
 * change has to be deliberate: rerun with --update-snapshots and review the
 * new images. Data is fixed (only "Today"/"Yesterday" dates) so images don't
 * drift from day to day.
 */
test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

const indiaDay = (offset: number) => {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function goaTrip(tag: string) {
  const asha = await createDevUser(tag, "Asha");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul", "Neha", "Bilal"] });
  const ids: Record<string, string> = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  const add = async (description: string, payer: string, total: number, day: number, shares?: Record<string, number>) => {
    const split = shares ?? Object.fromEntries(Object.keys(ids).map((n) => [n, total / 4]));
    const { error } = await asha.api.rpc("create_expense", {
      group_id: groupId, description, payer_member_id: ids[payer], total_paise: total, split_type: shares ? "unequal" : "equal",
      shares: Object.fromEntries(Object.entries(split).map(([n, p]) => [ids[n], p])), expense_date: indiaDay(day),
    });
    expect(error).toBeNull();
  };
  await add("Villa deposit", "Bilal", 800000, -1);
  await add("Scooter rental", "Neha", 120000, -1);
  await add("Cab to Baga beach", "Rahul", 45000, 0, { Asha: 15000, Rahul: 15000, Neha: 15000 });
  await add("Dinner at Thalassa", "Asha", 360000, 0);
  return { asha, groupId: groupId as string };
}

async function open(browser: Browser, testInfo: TestInfo, user: DevUser, path: string, scheme: "light" | "dark") {
  const context = await phoneFor(browser, testInfo, user);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  const hydrated = page.waitForRequest((r) => r.url().includes("/rest/v1/rpc/record_group_open"));
  await page.goto(path);
  await hydrated;
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

const snap = (page: Page, name: string) => expect(page).toHaveScreenshot(name, { maxDiffPixelRatio: 0.01 });

for (const scheme of ["light", "dark"] as const) {
  test(`key screens look as designed (${scheme})`, async ({ browser }, testInfo) => {
    const { asha, groupId } = await goaTrip(`screens-${scheme}`);
    const { context, page } = await open(browser, testInfo, asha, `/g/${groupId}`, scheme);

    await expect(page.getByTestId("expense-row")).toHaveCount(4);
    await snap(page, `group-${scheme}.png`);

    await page.getByRole("tab", { name: "Balances" }).click();
    await page.getByRole("switch", { name: /Simplify/ }).click();
    await expect(page.getByRole("switch", { name: /Simplify/ })).toHaveAttribute("aria-checked", "true");
    await snap(page, `balances-${scheme}.png`);

    await page.getByRole("tab", { name: "Expenses" }).click();
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.keyboard.type("1240");
    await page.getByLabel("What was it for?").fill("Breakfast at Infantaria");
    await page.getByRole("radio", { name: "Unequally" }).click();
    await page.getByLabel(/Asha/).fill("400");
    await page.getByLabel(/Rahul/).fill("300");
    await page.getByLabel(/Neha/).fill("240");
    await page.getByLabel(/Neha/).blur();
    await expect(page.getByTestId("auto-filled")).toHaveCount(1);
    await snap(page, `add-sheet-${scheme}.png`);
    await context.close();
  });
}

test("on a small phone, your total and who's behind it fit without scrolling", async ({ browser }, testInfo) => {
  const { asha, groupId } = await goaTrip("screens-small");
  const context = await browser.newContext({ ...testInfo.project.use, viewport: { width: 360, height: 640 } });
  await passVercelProtection(context, testInfo.project.use.baseURL);
  await context.addCookies(asha.cookies.map((c) => ({ ...c, url: testInfo.project.use.baseURL! })));
  const page = await context.newPage();
  await page.goto(`/g/${groupId}`);
  const people = page.getByTestId("summary-people");
  await expect(people).toBeVisible();
  const box = (await people.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  await context.close();
});
