import type { Browser, TestInfo } from "@playwright/test";
import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, type DevUser } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

async function setUp(browser: Browser, testInfo: TestInfo, tag: string) {
  const asha = await createDevUser(`${tag}-asha`, "Asha");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  const ids = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  const { data: expense, error } = await asha.api.rpc("create_expense", {
    group_id: groupId, description: "Dinner", payer_member_id: ids.Asha, total_paise: 2000, split_type: "equal",
    shares: { [ids.Asha]: 1000, [ids.Rahul]: 1000 },
  });
  expect(error).toBeNull();
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();
  await page.goto(`/g/${groupId}`);
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  return { asha, groupId: groupId as string, expenseId: (expense as { id: string }).id, context, page };
}

async function deletedAt(user: DevUser, expenseId: string) {
  // Deleted rows are still readable by members (soft delete); the list just hides them.
  const { data } = await user.api.from("expenses").select("deleted_at, version").eq("id", expenseId).single();
  return data!;
}

test("delete shows Undo, and Undo brings it back", async ({ browser }, testInfo) => {
  const { asha, expenseId, context, page } = await setUp(browser, testInfo, "undo");
  await page.getByTestId("expense-row").getByRole("button").click();
  await page.getByRole("button", { name: "Delete expense" }).click();

  await expect(page.getByTestId("expense-row")).toHaveCount(0);
  const toastText = page.getByText('Deleted "Dinner"');
  await expect(toastText).toBeVisible();
  const undo = page.getByRole("button", { name: "Undo" });
  expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect.poll(async () => (await deletedAt(asha, expenseId)).deleted_at).not.toBeNull();

  await undo.click();
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await expect(page.getByTestId("expense-row")).toContainText("Dinner");
  await expect.poll(async () => (await deletedAt(asha, expenseId)).deleted_at).toBeNull();
  expect((await deletedAt(asha, expenseId)).version).toBe(3); // delete and restore each bump it
  await context.close();
});

test("without Undo it stays deleted, for everyone", async ({ browser }, testInfo) => {
  const { asha, groupId, expenseId, context, page } = await setUp(browser, testInfo, "gone");
  await page.getByTestId("expense-row").getByRole("button").click();
  await page.getByRole("button", { name: "Delete expense" }).click();
  await expect.poll(async () => (await deletedAt(asha, expenseId)).deleted_at).not.toBeNull();
  await page.goto(`/g/${groupId}`);
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
  await context.close();
});

test("a delete that fails puts the expense back and says so", async ({ browser }, testInfo) => {
  const { asha, expenseId, context, page } = await setUp(browser, testInfo, "fail");
  await page.route("**/rest/v1/rpc/delete_expense", (route) => route.abort("internetdisconnected"));
  await page.getByTestId("expense-row").getByRole("button").click();
  await page.getByRole("button", { name: "Delete expense" }).click();
  await expect(page.getByText(/Couldn't delete "Dinner"/)).toBeVisible();
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  expect((await deletedAt(asha, expenseId)).deleted_at).toBeNull();
  await context.close();
});

test("Undo tapped while a slow delete is still in flight still keeps the expense", async ({ browser }, testInfo) => {
  const { asha, expenseId, context, page } = await setUp(browser, testInfo, "race");
  await page.route("**/rest/v1/rpc/delete_expense", async (route) => {
    await new Promise((r) => setTimeout(r, 1500)); // a slow network
    await route.continue();
  });
  await page.getByTestId("expense-row").getByRole("button").click();
  await page.getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("button", { name: "Undo" }).click(); // before the delete has landed

  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await expect(page.getByTestId("expense-row")).not.toHaveAttribute("data-pending");
  await expect.poll(async () => (await deletedAt(asha, expenseId)).version, { timeout: 10_000 }).toBe(3);
  expect((await deletedAt(asha, expenseId)).deleted_at).toBeNull();
  await page.reload();
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await context.close();
});
