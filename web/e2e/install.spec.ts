import { expect, test } from "@playwright/test";

/**
 * What a phone needs to offer "Install app" / "Add to Home Screen", checked
 * signed out (the browser fetches these before anyone signs in).
 */
test("the app can be installed to a home screen", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "Owezy", short_name: "Owezy", start_url: "/", display: "standalone" });

  // Android: a 192 and a 512 icon, plus a maskable one for its round icon shapes.
  const icons: { src: string; sizes: string; purpose: string }[] = manifest.icons;
  expect(icons.map((i) => `${i.sizes} ${i.purpose}`).sort()).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of icons) {
    const img = await request.get(icon.src);
    expect(img.ok(), icon.src).toBe(true);
    expect(img.headers()["content-type"]).toBe("image/png");
    const [w, h] = [(await img.body()).readUInt32BE(16), (await img.body()).readUInt32BE(20)]; // PNG header
    expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
  }

  // iPhone: the touch icon and home-screen app tags; every page links the manifest and favicon.
  await page.goto("/login");
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon!)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Owezy");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  for (const href of await page.locator('link[rel="icon"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!))) {
    expect((await request.get(href)).ok(), href).toBe(true);
  }
});

test("Chromium (Android) finds nothing stopping an install", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium-only check");
  await page.goto("/login");
  const cdp = await page.context().newCDPSession(page);
  const { errors } = await cdp.send("Page.getAppManifest");
  expect(errors).toEqual([]);
  // Test browsers are always private windows; that's the only reason allowed.
  await expect
    .poll(async () => (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors.map((e) => e.errorId))
    .toEqual(["in-incognito"]);
});
