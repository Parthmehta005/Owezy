import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, type DevUser } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

/** Asha's group (Asha, Rahul, Neha) with one expense; Bilal has joined as Rahul. */
async function setUp(tag: string, shares?: (ids: Record<string, string>) => Record<string, number>) {
  const asha = await createDevUser(`${tag}-asha`, "Asha");
  const bilal = await createDevUser(`${tag}-bilal`, "Bilal");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul", "Neha"] });
  const ids = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  const { data: code } = await asha.api.from("groups").select("invite_code").eq("id", groupId).single();
  expect((await bilal.api.rpc("join_group", { code: code!.invite_code, claim_member_id: ids.Rahul })).error).toBeNull();
  const split = shares?.(ids) ?? { [ids.Asha]: 30000, [ids.Rahul]: 30000, [ids.Neha]: 30000 };
  const { data: expense, error } = await asha.api.rpc("create_expense", {
    group_id: groupId, description: "Dinner", payer_member_id: ids.Asha, total_paise: 90000,
    split_type: shares ? "unequal" : "equal", shares: split,
  });
  expect(error).toBeNull();
  return { asha, bilal, groupId: groupId as string, ids, expenseId: (expense as { id: string }).id };
}

async function openGroup(browser: Browser, testInfo: TestInfo, user: DevUser, groupId: string) {
  const context = await phoneFor(browser, testInfo, user);
  const page = await context.newPage();
  await page.goto(`/g/${groupId}`);
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  return { context, page };
}

async function openRow(page: Page) {
  await page.getByTestId("expense-row").getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("Edit expense");
}

async function stored(user: DevUser, expenseId: string) {
  const { data } = await user.api
    .from("expenses")
    .select("description, total_paise, payer_member_id, version, split_type, expense_shares(member_id, share_paise)")
    .eq("id", expenseId)
    .maybeSingle();
  return data;
}

test("tap an expense to edit it", async ({ browser }, testInfo) => {
  const { asha, groupId, ids, expenseId } = await setUp("edit");
  const { context, page } = await openGroup(browser, testInfo, asha, groupId);

  await openRow(page);
  await expect(page.getByLabel("Amount in rupees")).toHaveValue("900");
  await expect(page.getByLabel("What was it for?")).toHaveValue("Dinner");
  await expect(page.getByRole("button", { name: /^Split/ })).toContainText("Equally, all 3");

  await page.getByLabel("Amount in rupees").fill("1200");
  await page.getByLabel("What was it for?").fill("Dinner and dessert");
  await page.getByRole("button", { name: /Paid by/ }).click();
  await page.getByRole("radio", { name: "Rahul" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  const row = page.getByTestId("expense-row");
  await expect(row).toContainText("Dinner and dessert");
  await expect(row).toContainText("Rahul paid ₹1,200");
  await expect(row).not.toHaveAttribute("data-pending");
  const saved = await stored(asha, expenseId);
  expect(saved).toMatchObject({ description: "Dinner and dessert", total_paise: 120000, payer_member_id: ids.Rahul, version: 2 });
  expect(saved!.expense_shares.map((s) => s.share_paise)).toEqual([40000, 40000, 40000]);
  await context.close();
});

test("an unequal expense reopens with its amounts", async ({ browser }, testInfo) => {
  const { asha, groupId } = await setUp("edit-unequal", (ids) => ({ [ids.Asha]: 70000, [ids.Rahul]: 20000, [ids.Neha]: 0 }));
  const { context, page } = await openGroup(browser, testInfo, asha, groupId);
  await openRow(page);
  await expect(page.getByRole("button", { name: /^Split/ })).toContainText("Unequally");
  await page.getByRole("button", { name: /^Split/ }).click();
  await expect(page.getByLabel(/Asha/)).toHaveValue("700");
  await expect(page.getByLabel(/Rahul/)).toHaveValue("200");
  await expect(page.getByTestId("split-remaining")).toHaveText("✓ All ₹900 assigned");
  await context.close();
});

test("two people editing at once: the second save sees the conflict", async ({ browser }, testInfo) => {
  const { asha, bilal, groupId, expenseId } = await setUp("conflict");
  const a = await openGroup(browser, testInfo, asha, groupId);
  const b = await openGroup(browser, testInfo, bilal, groupId);

  // Both open the same expense.
  await openRow(a.page);
  await openRow(b.page);

  // Bilal saves first.
  await b.page.getByLabel("What was it for?").fill("Dinner (Bilal's fix)");
  await b.page.getByRole("button", { name: "Save" }).click();
  await expect(b.page.getByTestId("expense-row")).not.toHaveAttribute("data-pending");
  expect((await stored(asha, expenseId))?.version).toBe(2);

  // Asha, still on the old version, saves: rejected, and shown Bilal's version.
  await a.page.getByLabel("What was it for?").fill("Dinner (Asha's fix)");
  await a.page.getByRole("button", { name: "Save" }).click();
  await expect(a.page.getByRole("alert")).toContainText("Someone else changed this expense");
  await expect(a.page.getByLabel("What was it for?")).toHaveValue("Dinner (Bilal's fix)");
  expect(await stored(asha, expenseId)).toMatchObject({ description: "Dinner (Bilal's fix)", version: 2 });

  // She makes her change again on top of the latest: accepted.
  await a.page.getByLabel("What was it for?").fill("Dinner (both fixes)");
  await a.page.getByRole("button", { name: "Save" }).click();
  await expect(a.page.getByRole("dialog")).toBeHidden();
  await expect(a.page.getByTestId("expense-row")).toContainText("Dinner (both fixes)");
  await expect(a.page.getByTestId("expense-row")).not.toHaveAttribute("data-pending");
  expect(await stored(asha, expenseId)).toMatchObject({ description: "Dinner (both fixes)", version: 3 });
  await Promise.all([a.context.close(), b.context.close()]);
});

test("editing an expense someone else deleted says so", async ({ browser }, testInfo) => {
  const { asha, bilal, groupId, expenseId } = await setUp("gone");
  const { context, page } = await openGroup(browser, testInfo, asha, groupId);
  await openRow(page);
  expect((await bilal.api.rpc("delete_expense", { expense_id: expenseId })).error).toBeNull();

  await page.getByLabel("What was it for?").fill("Too late");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "was deleted by someone else" })).toBeVisible();
  await expect(page.getByTestId("expense-row")).toHaveCount(0);
  await context.close();
});
