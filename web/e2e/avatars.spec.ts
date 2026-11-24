import { expect, test } from "./support/test";
import { cleanupDevUsers, closeDb, createDevUser, phoneFor, setAvatar } from "./support/dev-users";

test.beforeAll(cleanupDevUsers);
test.afterAll(async () => {
  await cleanupDevUsers();
  await closeDb();
});

// A tiny valid PNG, served for the fake photo host below.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("members show their sign-in photo; a broken one falls back to the letter", async ({ browser }, testInfo) => {
  const asha = await createDevUser("avatar-asha", "Asha");
  const bilal = await createDevUser("avatar-bilal", "Bilal");
  await setAvatar(asha, "https://photos.owezy.test/asha.png");
  await setAvatar(bilal, "https://photos.owezy.test/missing.png");
  const { data: groupId } = await asha.api.rpc("create_group", { group_name: "Goa trip", my_name: "Asha", other_names: ["Rahul", "Bilal"] });
  const ids = Object.fromEntries(
    ((await asha.api.from("members").select("id, display_name").eq("group_id", groupId)).data ?? []).map((m) => [m.display_name, m.id]),
  );
  const { data: code } = await asha.api.from("groups").select("invite_code").eq("id", groupId).single();
  expect((await bilal.api.rpc("join_group", { code: code!.invite_code, claim_member_id: ids.Bilal })).error).toBeNull();
  for (const payer of ["Asha", "Rahul", "Bilal"]) {
    const { error } = await asha.api.rpc("create_expense", {
      group_id: groupId, description: `${payer}'s round`, payer_member_id: ids[payer], total_paise: 3000, split_type: "equal",
      shares: { [ids.Asha]: 1000, [ids.Rahul]: 1000, [ids.Bilal]: 1000 },
    });
    expect(error).toBeNull();
  }

  const context = await phoneFor(browser, testInfo, bilal);
  await context.route("https://photos.owezy.test/asha.png", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await context.route("https://photos.owezy.test/missing.png", (route) => route.fulfill({ status: 404 }));
  const page = await context.newPage();
  await page.goto(`/g/${groupId}`);

  const avatarOf = (payer: string) => page.getByTestId("expense-row").filter({ hasText: `${payer}'s round` }).locator("[data-avatar]");
  await expect(avatarOf("Asha")).toHaveAttribute("data-avatar", "photo"); // a fellow member sees Asha's photo
  await expect(avatarOf("Bilal")).toHaveAttribute("data-avatar", "initial"); // his own photo is broken: letter
  await expect(avatarOf("Bilal")).toHaveText("B");
  await expect(avatarOf("Rahul")).toHaveText("R"); // not joined: letter
  await context.close();
});
