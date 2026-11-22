import { expect, test } from "@playwright/test";
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
  await expect(page.getByRole("heading", { name: "1 expense" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch group/ })).toContainText("Goa 2026");
  await b.close();
});
