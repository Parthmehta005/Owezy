import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./support/test";
import { computeBalances, pairwiseDebts } from "../src/core/balances";
import { formatRupees } from "../src/core/money";
import { simplifyDebts } from "../src/core/simplify";
import type { Debt } from "../src/core/types";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, type DevUser } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

/**
 * The fixture group from src/lib/balances-view.test.ts, made for real:
 *   Asha paid ₹3,000 for Asha, Rahul, Neha equally
 *   Neha paid ₹1,50,000: Neha ₹30,000, Bilal ₹1,20,000
 *   Rahul paid ₹600 for Rahul, Bilal equally
 * Bilal has joined (claiming his name); the others are placeholders.
 */
async function setUp(tag: string) {
  const asha = await createDevUser(`${tag}-asha`, "Asha");
  const bilal = await createDevUser(`${tag}-bilal`, "Bilal");
  const { data: groupId } = await asha.api.rpc("create_group", {
    group_name: "Goa trip",
    my_name: "Asha",
    other_names: ["Rahul", "Neha", "Bilal"],
  });
  const ids: Record<string, string> = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  const { data: code } = await asha.api.from("groups").select("invite_code").eq("id", groupId).single();
  expect((await bilal.api.rpc("join_group", { code: code!.invite_code, claim_member_id: ids.Bilal })).error).toBeNull();
  const add = async (description: string, payer: string, total: number, shares: Record<string, number>) => {
    const { error } = await asha.api.rpc("create_expense", {
      group_id: groupId,
      description,
      payer_member_id: ids[payer],
      total_paise: total,
      split_type: "unequal",
      shares: Object.fromEntries(Object.entries(shares).map(([name, paise]) => [ids[name], paise])),
    });
    expect(error).toBeNull();
  };
  await add("Villa", "Asha", 300000, { Asha: 100000, Rahul: 100000, Neha: 100000 });
  await add("Bike", "Neha", 15000000, { Neha: 3000000, Bilal: 12000000 });
  await add("Lunch", "Rahul", 60000, { Rahul: 30000, Bilal: 30000 });
  return { asha, bilal, groupId: groupId as string, ids };
}

/** What core says, straight from the database rows (independent of the app's view code). */
async function coreView(user: DevUser, groupId: string) {
  const members = (await user.api.from("members").select("id, display_name").eq("group_id", groupId).order("sort_order")).data!;
  const rows = (
    await user.api
      .from("expenses")
      .select("payer_member_id, total_paise, expense_shares(member_id, share_paise)")
      .eq("group_id", groupId)
      .is("deleted_at", null)
  ).data!;
  const expenses = rows.map((e) => ({
    payerId: e.payer_member_id,
    totalPaise: e.total_paise,
    shares: Object.fromEntries(e.expense_shares.map((s) => [s.member_id, s.share_paise])),
  }));
  const order = members.map((m) => m.id);
  const balances = computeBalances(order, expenses);
  const name = new Map(members.map((m) => [m.id, m.display_name]));
  // Order-free form: "Rahul>Asha ₹1,000".
  const asSet = (debts: Debt[]) => debts.map((d) => `${name.get(d.from)}>${name.get(d.to)} ${formatRupees(d.amountPaise)}`).sort();
  return { balances, raw: asSet(pairwiseDebts(expenses)), simplified: asSet(simplifyDebts(order, balances)) };
}

/** The rows on screen (both sections) in the same "From>To ₹N" form, read from the rows' data attributes. */
async function shownDebts(page: Page) {
  const rows = await page
    .getByTestId("debt-row")
    .evaluateAll((els) => els.map((e) => `${e.getAttribute("data-from")}>${e.getAttribute("data-to")} ${e.getAttribute("data-amount")}`));
  return rows.sort();
}

/** The rows under one section heading. */
function section(page: Page, heading: "You and each person" | "Between others") {
  return page.getByRole("region", { name: heading }).getByTestId("debt-row");
}

async function openGroup(browser: Browser, testInfo: TestInfo, user: DevUser, groupId: string) {
  const context = await phoneFor(browser, testInfo, user);
  const page = await context.newPage();
  await page.goto(`/g/${groupId}`);
  await expect(page.getByTestId("expense-row")).toHaveCount(3);
  return { context, page };
}

test("summary, raw debts and simplified debts match core, in Indian number format", async ({ browser }, testInfo) => {
  const { asha, groupId, ids } = await setUp("view");
  const core = await coreView(asha, groupId);
  const { context, page } = await openGroup(browser, testInfo, asha, groupId);

  // Header: Asha's net from core, which is also the hand-worked figure.
  expect(core.balances[ids.Asha].net).toBe(200000);
  await expect(page.getByTestId("my-summary")).toHaveText(/You get back\s*₹2,000/);

  // Raw debts.
  await page.getByRole("tab", { name: "Balances" }).click();
  await expect(page.getByTestId("debt-row")).toHaveCount(core.raw.length);
  expect(await shownDebts(page)).toEqual(core.raw);
  expect(core.raw).toEqual(["Bilal>Neha ₹1,20,000", "Bilal>Rahul ₹300", "Neha>Asha ₹1,000", "Rahul>Asha ₹1,000"]);
  const simplify = page.getByRole("switch", { name: /Simplify/ });
  await expect(simplify).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("payment-count")).toHaveText("4 → 3 payments");

  // Simplified.
  await simplify.click();
  await expect(simplify).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("debt-row")).toHaveCount(core.simplified.length);
  expect(await shownDebts(page)).toEqual(core.simplified);
  expect(core.simplified).toEqual(["Bilal>Asha ₹1,300", "Bilal>Neha ₹1,19,000", "Rahul>Asha ₹700"]);
  // Both sections switched to payments: yours under "You and each person", the rest under "Between others".
  await expect(section(page, "You and each person")).toHaveCount(2);
  await expect(section(page, "Between others")).toHaveCount(1);
  await expect(section(page, "Between others")).toContainText("Bilal owes Neha");
  await section(page, "You and each person").first().getByRole("button", { name: /Remind Bilal/ }).click();
  await expect(page.getByText("Reminders are coming soon.")).toBeVisible();

  // The choice survives a trip to the Expenses tab and back.
  await page.getByRole("tab", { name: "Expenses" }).click();
  await page.getByRole("tab", { name: "Balances" }).click();
  await expect(simplify).toHaveAttribute("aria-checked", "true");
  await context.close();
});

test("someone who owes sees it from their side", async ({ browser }, testInfo) => {
  const { bilal, groupId } = await setUp("owes");
  const { context, page } = await openGroup(browser, testInfo, bilal, groupId);
  await expect(page.getByTestId("my-summary")).toHaveText(/You owe\s*₹1,20,300/);
  await page.getByRole("tab", { name: "Balances" }).click();
  const mine = section(page, "You and each person");
  await expect(mine.first()).toContainText("Neha");
  await expect(mine.first()).toContainText("you owe");
  await expect(mine.first()).toContainText("₹1,20,000");
  await expect(mine.nth(1)).toContainText("Rahul");
  await expect(mine.nth(1)).toContainText("₹300");

  // Pay is shown where you owe; it isn't wired up yet, and says so.
  await mine.first().getByRole("button", { name: /Pay Neha/ }).click();
  await expect(page.getByText("Paying with GPay, Paytm or PhonePe is coming soon.")).toBeVisible();
  await context.close();
});

test("balances move the moment an expense is added, and a new group is all settled", async ({ browser }, testInfo) => {
  const { asha, groupId } = await setUp("live");
  const { context, page } = await openGroup(browser, testInfo, asha, groupId);

  // Asha pays ₹200 for all four equally: she lends ₹150 more.
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount in rupees").fill("200");
  await page.getByLabel("What was it for?").fill("Chai");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("my-summary")).toHaveText(/You get back\s*₹2,150/);
  await page.getByRole("tab", { name: "Balances" }).click();
  await expect(page.locator('[data-testid="debt-row"][data-from="Bilal"][data-to="Asha"]')).toHaveAttribute("data-amount", "₹50");
  await expect(page.getByTestId("debt-row")).toHaveCount(5);
  await expect.poll(async () => (await coreView(asha, groupId)).raw.length).toBe(5); // saved on the server too
  expect(await shownDebts(page)).toEqual((await coreView(asha, groupId)).raw);

  // A fresh group: nothing owed.
  await page.goto("/new");
  await page.getByLabel("Group name").fill("Empty");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByTestId("my-summary")).toHaveText("All settled");
  await page.getByRole("tab", { name: "Balances" }).click();
  await expect(page.getByRole("heading", { name: "All settled up" })).toBeVisible();
  await context.close();
});
