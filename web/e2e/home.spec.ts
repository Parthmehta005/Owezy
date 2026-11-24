import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, setGroupUsage } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

test("the app opens the group you use most, weighted to recent use", async ({ browser }, testInfo) => {
  const asha = await createDevUser("home-asha", "Asha");
  const make = async (name: string) =>
    (await asha.api.rpc("create_group", { group_name: name, my_name: "Asha", other_names: ["Rahul"] })).data as string;
  const goa = await make("Goa trip");
  const flat = await make("Flatmates");
  const context = await phoneFor(browser, testInfo, asha);
  const page = await context.newPage();

  // Flatmates is used most days.
  await setGroupUsage(asha, flat, 5, 1);
  await page.goto("/");
  await expect(page).toHaveURL(`/g/${flat}`);

  // Opening Goa trip once (counted when the screen loads) doesn't beat that.
  const counted = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/record_group_open"));
  await page.goto(`/g/${goa}`);
  expect((await counted).ok()).toBe(true);
  await page.goto("/");
  await expect(page).toHaveURL(`/g/${flat}`);

  // The group switcher lists them in the same order.
  await page.getByRole("button", { name: /Switch group/ }).click();
  await expect(page.getByRole("dialog").getByRole("link")).toContainText(["Flatmates", "Goa trip"]);
  await page.keyboard.press("Escape");

  // Months later, Flatmates has faded; the recently opened Goa trip wins.
  await setGroupUsage(asha, flat, 5, 60);
  await page.goto("/");
  await expect(page).toHaveURL(`/g/${goa}`);
  await context.close();
});
