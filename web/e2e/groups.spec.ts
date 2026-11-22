import { expect, test } from "@playwright/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

test("signed-out visitors are sent to sign in, keeping where they were going", async ({ page }) => {
  await page.goto("/join/someinvite12");
  await expect(page).toHaveURL(/\/login\?next=%2Fjoin%2Fsomeinvite12$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send me a link" })).toBeVisible();
});

// The M4 goal: A creates a group with placeholder names and shares the
// invite; B opens it and claims a name; both see the same group and
// members, and "/" brings each of them back to it.
test("two people share a group through an invite link", async ({ browser }, testInfo) => {
  const asha = await createDevUser("asha", "Asha Rao");
  const bilal = await createDevUser("bilal", "Bilal Khan");

  const a = await phoneFor(browser, testInfo, asha);
  const pageA = await a.newPage();

  // A has no groups yet, so "/" opens "New group".
  await pageA.goto("/");
  await expect(pageA).toHaveURL(/\/new$/);
  // Guard against losing the phone emulation in extra contexts: after our
  // page (with its viewport tag) loads, it must be phone-width and touch.
  expect(await pageA.evaluate(() => matchMedia("(pointer: coarse)").matches && window.innerWidth < 500)).toBe(true);
  await pageA.getByLabel("Group name").fill("Goa trip");
  await expect(pageA.getByLabel("Your name in this group")).toHaveValue("Asha Rao");
  await pageA.getByLabel("Your name in this group").fill("Asha");
  await pageA.getByLabel("Who else?").pressSequentially("Rahul Neha");
  await pageA.getByRole("button", { name: "Create group" }).click();
  await expect(pageA).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  const groupUrl = pageA.url();
  const membersA = pageA.locator("#members-heading + ul li");
  await expect(membersA).toHaveText(["Asha (you)", /^Rahul/, /^Neha/]);

  // A copies the invite link from settings.
  await pageA.getByRole("link", { name: "Group settings" }).click();
  const inviteUrl = pageA.getByTestId("invite-url");
  await expect(inviteUrl).toContainText("/join/");
  const invite = await inviteUrl.innerText();

  // B opens it and claims "Rahul" with one tap.
  const b = await phoneFor(browser, testInfo, bilal);
  const pageB = await b.newPage();
  await pageB.goto(invite);
  await expect(pageB.getByRole("heading", { level: 1 })).toHaveText("Goa trip");
  await pageB.getByRole("button", { name: "I'm Rahul" }).click();
  await expect(pageB).toHaveURL(groupUrl);
  await expect(pageB.locator("#members-heading + ul li")).toHaveText(["Asha", "Rahul (you)", /^Neha/]);

  // A sees Rahul has joined; Neha is still a placeholder.
  await pageA.goto(groupUrl);
  await expect(membersA).toHaveText(["Asha (you)", "Rahul", "Neha (not joined yet)"]);

  // "/" brings both back to the group.
  for (const page of [pageA, pageB]) {
    await page.goto("/");
    await expect(page).toHaveURL(groupUrl);
  }

  // The invite can't be used to claim Rahul again.
  const c = await phoneFor(browser, testInfo, await createDevUser("chitra", "Chitra"));
  const pageC = await c.newPage();
  await pageC.goto(invite);
  await expect(pageC.locator("#claim-heading + ul button")).toHaveText(["I'm Neha"]);

  await Promise.all([a.close(), b.close(), c.close()]);
});
