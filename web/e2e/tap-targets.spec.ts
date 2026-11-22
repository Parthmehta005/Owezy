import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor } from "./support/dev-users";

/**
 * Phones need tap targets at least 44px tall. Measures every visible
 * button, link and text field on each screen (and in open sheets/dialogs).
 */
const MIN = 44;

async function smallTargets(page: Page) {
  return page.evaluate((min) => {
    const els = document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), textarea, select, [role="button"]',
    );
    const out: string[] = [];
    for (const el of els) {
      if (el.closest("[hidden], [aria-hidden='true'], nextjs-portal")) continue;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
      if (r.height < min - 0.5) {
        const label = (el.getAttribute("aria-label") || el.innerText || el.id || el.getAttribute("name") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ");
        out.push(`${el.tagName.toLowerCase()} "${label.slice(0, 30)}" is ${Math.round(r.height)}px tall`);
      }
    }
    return out;
  }, MIN);
}

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

test("every tap target is at least 44px tall", async ({ browser }, testInfo) => {
  const problems: Record<string, string[]> = {};
  const check = async (page: Page, screen: string) => {
    const small = await smallTargets(page);
    if (small.length) problems[screen] = small;
  };

  // Signed out.
  const anon = await phoneFor(browser, testInfo);
  const login = await anon.newPage();
  await login.goto("/login");
  await login.getByRole("button", { name: "Continue with Google" }).waitFor();
  await check(login, "login");

  // Signed in: new group (with chips), group screen, switcher, settings, leave confirm.
  const asha = await createDevUser("tap-asha", "Asha");
  const a = await phoneFor(browser, testInfo, asha);
  const page = await a.newPage();
  await page.goto("/new");
  // Server-rendered: typing before the page's scripts attach loses the chips
  // (the group then has only Asha, and nothing to owe). Retry until they show.
  const others = page.getByLabel("Who else?");
  await expect(async () => {
    await others.fill("");
    await others.pressSequentially("Rahul Neha ");
    await expect(page.getByRole("button", { name: "Remove Neha" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await check(page, "new group");
  await page.getByLabel("Group name").fill("Tap test");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByRole("heading", { name: "No expenses yet" }).waitFor();
  await check(page, "group");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.keyboard.type("900");
  await page.getByRole("button", { name: /Paid by/ }).click();
  await check(page, "add sheet + payer list");
  await page.getByRole("button", { name: /^Split/ }).click();
  await check(page, "add sheet + equal split");
  await page.getByRole("radio", { name: "Unequally" }).click();
  await check(page, "add sheet + unequal split");
  await page.getByLabel("What was it for?").fill("Tap test dinner");
  await page.getByRole("radio", { name: "Equally", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByTestId("expense-row").first().waitFor();
  await page.waitForTimeout(500);
  await check(page, "group with an expense");
  await page.getByRole("tab", { name: "Balances" }).click();
  await page.getByRole("switch", { name: /Simplify/ }).click();
  await check(page, "balances, simplified");
  await page.getByRole("tab", { name: "Expenses" }).click();
  await page.getByTestId("expense-row").first().getByRole("button").click();
  await page.getByRole("dialog").waitFor();
  await check(page, "edit sheet");
  await page.getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("button", { name: "Undo" }).waitFor();
  await check(page, "undo toast");
  await page.getByRole("button", { name: /Switch group/ }).click();
  await page.getByRole("dialog").waitFor();
  await check(page, "group switcher");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Group settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.getByLabel("Add people").pressSequentially("Kiran ");
  await check(page, "settings");
  await page.getByRole("button", { name: "Leave group" }).click();
  await check(page, "leave confirm");
  const invite = await page.getByTestId("invite-url").innerText();

  // Join screen, as someone else.
  const b = await phoneFor(browser, testInfo, await createDevUser("tap-bilal", "Bilal"));
  const join = await b.newPage();
  await join.goto(invite);
  await join.getByText("You're invited to").waitFor();
  await check(join, "join");

  await Promise.all([anon.close(), a.close(), b.close()]);
  expect(problems).toEqual({});
});
