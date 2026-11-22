import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

// No live updates in v1: changes made by others appear when you come back
// to the app (switching tabs or reopening the installed app fires
// visibilitychange).
test("returning to the app shows changes others made", async ({ browser }, testInfo) => {
  const asha = await createDevUser("refresh-asha", "Asha");
  const bilal = await createDevUser("refresh-bilal", "Bilal");
  const { data: groupId, error } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  expect(error).toBeNull();
  const { data: code } = await asha.api.from("groups").select("invite_code").eq("id", groupId).single();
  const { data: rahul } = await asha.api.from("members").select("id").eq("group_id", groupId).eq("display_name", "Rahul").single();
  expect((await bilal.api.rpc("join_group", { code: code!.invite_code, claim_member_id: rahul!.id })).error).toBeNull();

  const b = await phoneFor(browser, testInfo, bilal);
  const page = await b.newPage();
  const dataRequests: string[] = [];
  page.on("request", (r) => r.url().includes("/rest/v1/") && dataRequests.push(r.url()));
  await page.goto(`/g/${groupId}`);
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(dataRequests.filter((u) => u.includes("/expenses"))).toEqual([]); // first paint used the server's copy

  // Meanwhile, on Asha's phone.
  const { data: asha_m } = await asha.api.from("members").select("id").eq("group_id", groupId).eq("display_name", "Asha").single();
  expect((await asha.api.from("groups").update({ name: "Goa 2026" }).eq("id", groupId)).error).toBeNull();
  const created = await asha.api.rpc("create_expense", {
    group_id: groupId, description: "Dinner", payer_member_id: asha_m!.id, total_paise: 2000, split_type: "equal",
    shares: { [asha_m!.id]: 1000, [rahul!.id]: 1000 },
  });
  expect(created.error).toBeNull();

  // Bilal comes back to the app.
  // A real visibilitychange bubbles from document to window, where TanStack listens.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await expect(page.getByTestId("expense-row")).toContainText("Dinner");
  await expect(page.getByRole("button", { name: /Switch group/ })).toContainText("Goa 2026");
  await b.close();
});

// The M5 goal, phone to phone through the UI: one person adds an expense
// with the sheet; the other sees it, with the right effect for them, when
// they come back to the app.
test("an expense added on one phone appears on the other on return", async ({ browser }, testInfo) => {
  const asha = await createDevUser("goal-asha", "Asha");
  const bilal = await createDevUser("goal-bilal", "Bilal");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  const { data: code } = await asha.api.from("groups").select("invite_code").eq("id", groupId).single();
  const { data: rahul } = await asha.api.from("members").select("id").eq("group_id", groupId).eq("display_name", "Rahul").single();
  expect((await bilal.api.rpc("join_group", { code: code!.invite_code, claim_member_id: rahul!.id })).error).toBeNull();

  const a = await phoneFor(browser, testInfo, asha);
  const b = await phoneFor(browser, testInfo, bilal);
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  await pageA.goto(`/g/${groupId}`);
  await pageB.goto(`/g/${groupId}`);
  await expect(pageB.getByRole("heading", { name: "No expenses yet" })).toBeVisible();

  // Asha adds ₹900 for dinner, split equally between her and Rahul (Bilal).
  await pageA.getByRole("button", { name: "Add expense" }).click();
  await pageA.keyboard.type("900");
  await pageA.getByLabel("What was it for?").fill("Dinner");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageA.getByTestId("expense-row")).not.toHaveAttribute("data-pending");
  await expect(pageA.getByTestId("expense-row")).toContainText("you lent");

  // Bilal comes back to the app.
  await pageB.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
  const row = pageB.getByTestId("expense-row");
  await expect(row).toContainText("Dinner");
  await expect(row).toContainText("Asha paid ₹900.00");
  await expect(row).toContainText("you borrowed");
  await expect(row).toContainText("₹450.00");
  await Promise.all([a.close(), b.close()]);
});
