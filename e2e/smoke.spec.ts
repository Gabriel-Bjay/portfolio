import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home page loads without console errors or a11y violations", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(a11y.violations.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});
