import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

test("settings switch between light and dark, overriding the phone and remembered", async ({ browser }, testInfo) => {
  const asha = await createDevUser("theme-asha", "Asha");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light" }); // the phone itself is in light mode
  await page.goto(`/g/${groupId}/settings`);

  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  const html = page.locator("html");
  const pageColour = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const statusBar = () => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")));

  await expect(appearance.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await expect(html).not.toHaveClass(/dark/);

  // Dark, though the phone is light.
  await appearance.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/dark/);
  expect(await pageColour()).toBe("rgb(14, 18, 32)");
  expect(new Set(await statusBar())).toEqual(new Set(["#0e1220"]));

  // Remembered after a reload, and on other screens.
  await page.reload();
  await expect(appearance.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await page.goto(`/g/${groupId}`);
  await expect(html).toHaveClass(/dark/);

  // Light, though the phone is dark.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/g/${groupId}/settings`);
  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
  expect(await pageColour()).toBe("rgb(245, 246, 248)");

  // Back to following the phone (dark here).
  await appearance.getByRole("radio", { name: "System" }).click();
  await expect(html).toHaveClass(/dark/);
  await context.close();
});
