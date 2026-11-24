import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, type DevUser } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

/** Rows as the server stored them (read with the user's own API client, so RLS applies). */
async function storedExpenses(user: DevUser, groupId: string) {
  const { data, error } = await user.api
    .from("expenses")
    .select("id, description, total_paise, expense_date, payer_member_id, expense_shares(member_id, share_paise)")
    .eq("group_id", groupId)
    .is("deleted_at", null);
  if (error) throw error;
  return data;
}

async function setUp(browser: import("@playwright/test").Browser, testInfo: import("@playwright/test").TestInfo, tag: string) {
  const asha = await createDevUser(`${tag}-asha`, "Asha");
  const { data: groupId, error } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul", "Neha"] });
  if (error) throw error;
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();
  await page.goto(`/g/${groupId}`);
  await page.getByRole("heading", { name: "No expenses yet" }).waitFor();
  return { asha, groupId: groupId as string, context, page };
}

async function openSheet(page: Page) {
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("add an expense in 3 taps plus typing", async ({ browser }, testInfo) => {
  const { asha, groupId, context, page } = await setUp(browser, testInfo, "add");

  await openSheet(page); // tap 1
  const amount = page.getByLabel("Amount in rupees");
  await expect(amount).toBeFocused(); // number pad is up without another tap
  await expect(amount).toHaveAttribute("inputmode", "decimal");
  await page.keyboard.type("900");
  await page.getByLabel("What was it for?").click(); // tap 2
  await page.keyboard.type("Dinner");
  await expect(page.getByTestId("expense-preview")).toHaveText("You get back ₹600");
  await page.getByRole("button", { name: "Save" }).click(); // tap 3

  await expect(page.getByRole("dialog")).toBeHidden();
  const row = page.getByTestId("expense-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Dinner");
  await expect(row).toContainText("you lent");
  await expect(row).toContainText("₹600");
  await expect(row).not.toHaveAttribute("data-pending"); // confirmed by the server

  const [saved] = await storedExpenses(asha, groupId);
  expect(saved.total_paise).toBe(90000);
  expect(saved.expense_shares.map((s) => s.share_paise).sort()).toEqual([30000, 30000, 30000]);
  await context.close();
});

test("someone else paid, comma decimals, and a chosen date", async ({ browser }, testInfo) => {
  const { asha, groupId, context, page } = await setUp(browser, testInfo, "options");

  await openSheet(page);
  await page.keyboard.type("10,50"); // Android keyboards may type a comma as the decimal point
  await page.getByLabel("What was it for?").fill("Chai");
  await page.getByRole("button", { name: /Paid by/ }).click();
  await page.getByRole("radio", { name: "Rahul" }).click();
  await expect(page.getByTestId("expense-preview")).toHaveText("You owe ₹3.50");
  const yesterday = await page.getByLabel("Date").evaluate((el: HTMLInputElement) => {
    const d = new Date(el.value + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  await page.getByLabel("Date").fill(yesterday);
  await expect(page.getByRole("dialog")).toContainText("Yesterday");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
  await expect(page.getByTestId("expense-row")).toContainText("Rahul paid ₹10.50");
  await expect(page.getByTestId("expense-row")).not.toHaveAttribute("data-pending");
  const [saved] = await storedExpenses(asha, groupId);
  expect(saved.total_paise).toBe(1050);
  expect(saved.expense_date).toBe(yesterday);
  await context.close();
});

test("a failed save keeps what was typed, and retrying never duplicates", async ({ browser }, testInfo) => {
  const { asha, groupId, context, page } = await setUp(browser, testInfo, "retry");
  const rpc = "**/rest/v1/rpc/create_expense";

  // 1. The request never reaches the server (no signal).
  await page.route(rpc, (route) => route.abort("internetdisconnected"), { times: 1 });
  await openSheet(page);
  await page.keyboard.type("300");
  await page.getByLabel("What was it for?").fill("Cab");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("Not saved");
  await expect(page.getByLabel("Amount in rupees")).toHaveValue("300");
  await expect(page.getByLabel("What was it for?")).toHaveValue("Cab");
  await expect(page.getByTestId("expense-row")).toHaveCount(0); // the optimistic row was rolled back

  // 2. The server saves it, but the reply is lost on the way back.
  await page.route(
    rpc,
    async (route) => {
      await route.fetch(); // reaches the server and is saved...
      await route.abort("connectionreset"); // ...but the phone never hears back
    },
    { times: 1 },
  );
  const lost = page.waitForEvent("requestfailed", (r) => r.url().includes("/rpc/create_expense"));
  await page.getByRole("button", { name: "Save" }).click();
  await lost;
  await expect(page.getByRole("alert")).toContainText("Not saved");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled(); // a second failure must not lock Save
  expect(await storedExpenses(asha, groupId)).toHaveLength(1);

  // 3. Retry with a working network: still exactly one expense.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await expect(page.getByTestId("expense-row")).not.toHaveAttribute("data-pending");
  expect(await storedExpenses(asha, groupId)).toHaveLength(1);

  // 4. A double tap on Save also makes just one.
  await openSheet(page);
  await page.keyboard.type("50");
  await page.getByLabel("What was it for?").fill("Water");
  await page.getByRole("button", { name: "Save" }).dblclick();
  await expect(page.getByTestId("expense-row")).toHaveCount(2);
  await expect(page.getByTestId("expense-row").first()).not.toHaveAttribute("data-pending");
  expect(await storedExpenses(asha, groupId)).toHaveLength(2);
  await context.close();
});


test("split between some people, or unequally, with Save only when it adds up", async ({ browser }, testInfo) => {
  const { asha, groupId, context, page } = await setUp(browser, testInfo, "split");
  const save = page.getByRole("button", { name: "Save" });
  const ids = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  const sharesOf = async (description: string) => {
    const row = (await storedExpenses(asha, groupId)).find((e) => e.description === description)!;
    return Object.fromEntries(row.expense_shares.map((s) => [Object.keys(ids).find((n) => ids[n] === s.member_id), s.share_paise]));
  };

  // Equal, between Asha and Rahul only.
  await openSheet(page);
  await page.keyboard.type("1000");
  await page.getByLabel("What was it for?").fill("Groceries");
  // The people list is always there under the Equally | Unequally toggle.
  await expect(page.getByRole("radio", { name: "Equally", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("checkbox", { name: /Neha/ }).click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(page.getByRole("checkbox", { name: /Rahul/ })).toContainText("₹500");
  // Nobody included: a problem, and no Save.
  await page.getByRole("checkbox", { name: /Asha/ }).click();
  await page.getByRole("checkbox", { name: /Rahul/ }).click();
  await expect(page.getByText("Select at least one person.")).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole("checkbox", { name: /Asha/ }).click();
  await page.getByRole("checkbox", { name: /Rahul/ }).click();
  await save.click();
  await expect(page.getByTestId("expense-row").first()).not.toHaveAttribute("data-pending");
  expect(await sharesOf("Groceries")).toEqual({ Asha: 50000, Rahul: 50000 });

  // Unequal: the counter and the Save rule.
  await openSheet(page);
  await page.keyboard.type("1000");
  await page.getByLabel("What was it for?").fill("Hotel");
  await page.getByRole("radio", { name: "Unequally" }).click();
  const remaining = page.getByTestId("split-remaining");
  await page.getByLabel(/Asha/).fill("700");
  await expect(remaining).toHaveText("₹300 left");
  await expect(save).toBeDisabled();
  await page.getByLabel(/Rahul/).fill("400");
  await expect(remaining).toHaveText("₹100 over");
  await expect(save).toBeDisabled();
  await page.getByLabel(/Rahul/).fill("299,50"); // comma decimal works here too
  await page.getByLabel(/Neha/).fill("0.50");
  await expect(remaining).toHaveText("✓ All ₹1,000 assigned");
  await expect(page.getByRole("radio", { name: "Unequally" })).toHaveAttribute("aria-checked", "true");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId("expense-row").first()).not.toHaveAttribute("data-pending");
  expect(await sharesOf("Hotel")).toEqual({ Asha: 70000, Rahul: 29950, Neha: 50 });
  await context.close();
});
