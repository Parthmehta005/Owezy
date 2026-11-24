import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, type DevUser } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

/** Asha's group, open on her phone; `installed` makes it look like the home-screen app. */
async function openGroup(browser: Browser, testInfo: TestInfo, tag: string, installed: boolean) {
  const asha = await createDevUser(tag, "Asha");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul"] });
  const context = await phoneFor(browser, testInfo, asha);
  if (installed) {
    await context.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const list = real(query);
        if (query.includes("display-mode: standalone")) Object.defineProperty(list, "matches", { value: true });
        return list;
      };
    });
  }
  const page = await context.newPage();
  // Server-rendered, so it shows before its scripts are live; this visit is recorded once hydrated.
  const hydrated = page.waitForRequest((r) => r.url().includes("/rest/v1/rpc/record_group_open"));
  await page.goto(`/g/${groupId}`);
  await hydrated;
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
  return { asha, groupId: groupId as string, context, page };
}

/** Someone else adds an expense to the group. */
async function rahulAddsChai(asha: DevUser, groupId: string) {
  const { data: members } = await asha.api.from("members").select("id, display_name").eq("group_id", groupId);
  const id = (n: string) => members!.find((m) => m.display_name === n)!.id;
  const { error } = await asha.api.rpc("create_expense", {
    group_id: groupId, description: "Chai", payer_member_id: id("Rahul"), total_paise: 4000, split_type: "equal",
    shares: { [id("Asha")]: 2000, [id("Rahul")]: 2000 },
  });
  expect(error).toBeNull();
}

type Finger = { move: (y: number) => Promise<void>; lift: (y: number) => Promise<void> };

/**
 * A finger on the screen at `y`. Chromium gets real touch input (DevTools
 * protocol). WebKit can't create touches from a script, so it gets touch
 * events carrying the same fields the app reads.
 */
async function touch(page: Page, y: number): Promise<Finger> {
  if (page.context().browser()?.browserType().name() === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: 200, y }] });
    await send("touchStart", y);
    return { move: (y) => send("touchMove", y).then(() => undefined), lift: () => send("touchEnd").then(() => undefined) };
  }
  const fire = (type: string, y: number) =>
    page.evaluate(
      ({ type, y }) => {
        const target = document.querySelector("main")!;
        const point = { identifier: 1, target, clientX: 200, clientY: y };
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [point] });
        Object.defineProperty(event, "changedTouches", { value: [point] });
        target.dispatchEvent(event);
      },
      { type, y },
    );
  await fire("touchstart", y);
  return { move: (y) => fire("touchmove", y), lift: (y) => fire("touchend", y) };
}

/** Drag down from y=150 by `distance` px in small steps; returns the finger, still down. */
async function pullDown(page: Page, distance: number) {
  const finger = await touch(page, 150);
  for (let y = 150; y <= 150 + distance; y += 20) {
    await finger.move(y);
    await page.waitForTimeout(16);
  }
  return finger;
}

test("in the installed app, pulling down refreshes in place", async ({ browser }, testInfo) => {
  const { asha, groupId, context, page } = await openGroup(browser, testInfo, "ptr-app", true);
  await rahulAddsChai(asha, groupId);

  // A short pull isn't enough: let go and nothing loads.
  const loads: string[] = [];
  page.on("request", (r) => r.url().includes("/rest/v1/expenses") && loads.push(r.url()));
  await (await pullDown(page, 80)).lift(230);
  await page.waitForTimeout(500);
  expect(loads).toEqual([]);
  await expect(page.getByTestId("pull-to-refresh")).toHaveCount(0);

  // A long pull says "Release to refresh"; letting go loads Rahul's expense without reloading the page.
  await page.evaluate(() => ((window as Window & { notReloaded?: boolean }).notReloaded = true));
  const finger = await pullDown(page, 240);
  await expect(page.getByTestId("pull-to-refresh")).toHaveAttribute("aria-label", "Release to refresh");
  await finger.lift(390);
  await expect(page.getByTestId("expense-row")).toContainText("Chai");
  await expect(page.getByTestId("pull-to-refresh")).toHaveCount(0);
  expect(loads.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as Window & { notReloaded?: boolean }).notReloaded)).toBe(true);
  await context.close();
});

test("in a browser tab it stays out of the way of the browser's own pull-to-reload", async ({ browser }, testInfo) => {
  const { context, page } = await openGroup(browser, testInfo, "ptr-tab", false);
  await pullDown(page, 240);
  await page.waitForTimeout(300);
  await expect(page.getByTestId("pull-to-refresh")).toHaveCount(0);
  await context.close();
});
