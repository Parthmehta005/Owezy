import { expect, test } from "@playwright/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

test("a link that goes nowhere shows a way back", async ({ browser }, testInfo) => {
  const asha = await createDevUser("states-404", "Asha");
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to my groups" }).click();
  await expect(page).toHaveURL(/\/new$/); // no groups yet
  await context.close();
});

test("a failed background refresh keeps the screen and offers Retry", async ({ browser }, testInfo) => {
  const asha = await createDevUser("states-refresh", "Asha");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();
  // The screen is server-rendered, so it shows before its scripts are live. The
  // "remember last group" save is sent once the group screen has hydrated.
  const hydrated = page.waitForRequest((r) => r.url().includes("/rest/v1/profiles"));
  await page.goto(`/g/${groupId}`);
  await hydrated;
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();

  // The connection drops, and she comes back to the app.
  await page.route("**/rest/v1/**", (route) => route.abort("internetdisconnected"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
  const notice = page.getByRole("status").filter({ hasText: "Couldn't refresh" });
  await expect(notice).toBeVisible({ timeout: 20_000 }); // after the automatic retries
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible(); // still on screen

  // Meanwhile Rahul's expense lands; back online, Retry picks it up.
  const { data: members } = await asha.api.from("members").select("id, display_name").eq("group_id", groupId);
  const id = (n: string) => members!.find((m) => m.display_name === n)!.id;
  const created = await asha.api.rpc("create_expense", {
    group_id: groupId, description: "Chai", payer_member_id: id("Rahul"), total_paise: 4000, split_type: "equal",
    shares: { [id("Asha")]: 2000, [id("Rahul")]: 2000 },
  });
  expect(created.error).toBeNull();
  await page.unroute("**/rest/v1/**");
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(notice).toBeHidden();
  await expect(page.getByTestId("expense-row")).toContainText("Chai");
  await context.close();
});
