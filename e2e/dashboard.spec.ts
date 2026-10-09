import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

// Known totals for e2e/fixtures/sales-small.csv (19 readable orders, 1 row with an unreadable amount).
const SMALL = {
  revenue: "KES 109,600",
  orders: "19",
  unitPriceRevenue: "103,400",
  cbdRevenue: "KES 44,900",
  cbdOrders: "7",
};
const CHART_TITLES = ["Revenue over time", "Top products", "Revenue by category", "Weekday pattern"];

/** Collects console errors and uncaught exceptions for the whole test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function open(page: Page) {
  await page.goto("/dashboard");
  // Handlers only exist once React has hydrated; clicking earlier would do nothing.
  await page.waitForSelector('[data-hydrated="true"]');
}

async function openWithFile(page: Page, file: string) {
  await open(page);
  await page.locator('input[type="file"]').setInputFiles(fixture(file));
  await expect(page.getByRole("heading", { name: "What stands out" })).toBeVisible({ timeout: 30_000 });
}

async function openSample(page: Page) {
  await open(page);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByRole("heading", { name: "What stands out" })).toBeVisible({ timeout: 30_000 });
}

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test.describe("landing", () => {
  test("explains the product, offers a sample, a sample CSV and a privacy note", async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Mauzo Insights" })).toBeVisible();
    await expect(page.getByLabel(/drop a csv or excel file/i)).toBeAttached();
    await expect(page.getByRole("button", { name: "Try with sample data" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download sample CSV" })).toHaveAttribute(
      "href",
      "/dashboard/sample.csv",
    );
    await expect(page.getByText("Your file never leaves your device.")).toBeVisible();
    await expect(page.getByText("Duka Digital, a fictional store").first()).toBeVisible();
    await expectNoA11yViolations(page);
    expect(errors).toEqual([]);
  });

  test("the file input is a real, keyboard-focusable control", async ({ page }) => {
    await open(page);
    const input = page.locator('input[type="file"]');
    await input.focus();
    await expect(input).toBeFocused();
    // The drop zone shows a visible focus ring while the hidden input has focus.
    const outline = await page
      .locator("div:has(> input[type=file])")
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("the sample CSV link serves the generated file", async ({ request }) => {
    const res = await request.get("/dashboard/sample.csv");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body.split("\n")[0]).toBe("Date,Order ID,Product,Category,Region,Channel,Customer,Quantity,Amount (KES)");
    expect(body.split("\n").length).toBeGreaterThan(8000);
  });

  test("rejects unsupported and empty files with a friendly message", async ({ page }) => {
    await open(page);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
    await expect(page.locator('p[role="alert"]')).toContainText("Please choose a .csv or .xlsx file");

    await input.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("") });
    await expect(page.locator('p[role="alert"]')).toContainText("empty");

    await input.setInputFiles({ name: "header-only.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Amount\n") });
    await expect(page.locator('p[role="alert"]')).toContainText("no sales rows");

    await input.setInputFiles({ name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") });
    await expect(page.locator('p[role="alert"]')).toContainText(".xlsx");
    // Still on the landing screen, ready for another try.
    await expect(page.getByRole("button", { name: "Try with sample data" })).toBeVisible();
  });
});

test.describe("sample data", () => {
  test("renders KPIs, all four charts, a forecast and at least four insights", async ({ page }) => {
    const errors = trackErrors(page);
    await openSample(page);

    await expect(page.getByText("Duka Digital, a fictional store").first()).toBeVisible();
    for (const label of ["Revenue", "Orders", "Average order", "Units sold"]) {
      await expect(page.locator("dt", { hasText: label })).toBeVisible();
    }
    for (const title of CHART_TITLES) {
      const card = page.getByRole("region", { name: title, exact: true });
      await expect(card).toBeVisible();
      await expect(card.locator("svg path").first()).toBeAttached();
    }
    await expect(page.getByText("Forecast", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Likely range (95%)")).toBeVisible();
    expect(await page.getByTestId("insights").locator("li").count()).toBeGreaterThanOrEqual(4);
    await expect(page.getByTestId("insights")).toContainText("Revenue grew");

    await expectNoA11yViolations(page);
    expect(errors).toEqual([]);
  });

  test("every chart has a working Show table", async ({ page }) => {
    await openSample(page);
    for (const title of CHART_TITLES) {
      const card = page.getByRole("region", { name: title, exact: true });
      const toggle = card.getByRole("button", { name: /^(show|hide) table$/i });
      await toggle.click();
      await expect(toggle).toHaveText("Hide table");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const table = card.getByRole("table");
      await expect(table).toBeVisible();
      expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(2);
      await expect(table.locator("th[scope=col]").first()).toBeVisible();
      await toggle.click();
      await expect(table).toBeHidden();
    }
  });

  test("tables hold the same numbers as the summary", async ({ page }) => {
    await openSample(page);
    const card = page.getByRole("region", { name: "Top products", exact: true });
    await card.getByRole("button", { name: "Show table" }).click();
    const firstRow = card.getByRole("table").locator("tbody tr").first();
    await expect(firstRow.locator("th")).toHaveText("Samsung Galaxy A15");
    await expect(card).toContainText("Samsung Galaxy A15 leads with");
  });

  test("the date range presets change KPIs, comparisons and charts", async ({ page }) => {
    await openSample(page);
    const revenue = page.getByTestId("kpi-revenue");
    const all = (await revenue.textContent()) ?? "";
    await expect(page.getByText("Across all", { exact: false }).first()).toBeVisible();
    const chartSummary = page.getByRole("region", { name: "Revenue over time", exact: true }).locator("p").first();
    const allSummary = (await chartSummary.textContent()) ?? "";

    await page.getByRole("button", { name: "Last 30 days" }).click();
    await expect(page.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
    await expect(revenue).not.toHaveText(all);
    await expect(page.getByText("vs previous 30 days").first()).toBeVisible();
    await expect(chartSummary).not.toHaveText(allSummary);
    expect(await page.getByText(/▲|▼/).count()).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Year to date" }).click();
    await expect(page.getByRole("button", { name: "Year to date" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(revenue).toHaveText(all);
  });

  test("the breakdown can switch dimension", async ({ page }) => {
    await openSample(page);
    const card = page.getByRole("region", { name: "Revenue by category", exact: true });
    await expect(card).toContainText("Phones leads");
    await card.getByLabel("Break down by").selectOption("region");
    await expect(page.getByRole("region", { name: "Revenue by region", exact: true })).toContainText("leads with");
    await page
      .getByRole("region", { name: "Revenue by region", exact: true })
      .getByRole("button", { name: "Show table" })
      .click();
    await expect(page.getByRole("region", { name: "Revenue by region", exact: true }).getByRole("table")).toContainText(
      "Online delivery",
    );
  });

  test("Export summary CSV downloads the numbers on screen", async ({ page }) => {
    await openSample(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export summary CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("duka-digital-sample-summary.csv");
    const text = readFileSync((await download.path()) as string, "utf8");
    expect(text).toContain("Section,Item,Value,Share %,Note");
    expect(text).toContain("Summary,Revenue,");
    expect(text).toContain("Top products,Samsung Galaxy A15,");
    await expect(page.getByRole("button", { name: /Summary exported/ })).toBeVisible();
  });

  test("Download report opens the print dialog and print hides the controls", async ({ page }) => {
    await openSample(page);
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed++;
      };
    });
    await page.getByRole("button", { name: "Download report" }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    await page.emulateMedia({ media: "print" });
    for (const name of ["Start over", "Export summary CSV", "Download report", "Show table"]) {
      await expect(page.getByRole("button", { name }).first()).toBeHidden();
    }
    await expect(page.getByRole("group", { name: "Date range" })).toBeHidden();
    await expect(page.getByText(/^Report for duka-digital-sample\.csv/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revenue over time" })).toBeVisible();
  });

  test("Start over returns to the landing screen", async ({ page }) => {
    await openSample(page);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByRole("button", { name: "Try with sample data" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What stands out" })).toHaveCount(0);
  });
});

test.describe("uploading files", () => {
  test("sales-small.csv shows the exact revenue total and the skipped row", async ({ page }) => {
    const errors = trackErrors(page);
    await openWithFile(page, "sales-small.csv");
    await expect(page.getByTestId("kpi-revenue")).toHaveText(SMALL.revenue);
    await expect(page.getByTestId("kpi-orders")).toHaveText(SMALL.orders);
    await expect(page.getByText("1 row skipped")).toBeVisible();
    await expect(page.getByText("1 row skipped: unreadable amount")).toBeVisible();
    // Columns were matched automatically, day-first dates were understood.
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue("0");
    await expect(page.getByLabel("Amount", { exact: true }).locator("option:checked")).toHaveText("Amount");
    await expect(page.getByText("3 Mar 2025 to 29 Mar 2025").first()).toBeVisible();
    await expect(page.getByTestId("kpi-units-sold")).toHaveText("34");
    await expectNoA11yViolations(page);
    expect(errors).toEqual([]);
  });

  test("choosing another column for Amount changes the numbers", async ({ page }) => {
    await openWithFile(page, "sales-small.csv");
    await expect(page.getByTestId("kpi-revenue")).toHaveText(SMALL.revenue);
    await page.getByLabel("Amount", { exact: true }).selectOption({ label: "Unit Price" });
    await expect(page.getByTestId("kpi-revenue")).toHaveText(SMALL.unitPriceRevenue);
    // Unit Price cells carry no currency, so the figures lose their KES prefix; the unreadable amount is no longer in play.
    await expect(page.getByText(/rows? skipped/)).toHaveCount(0);
    await expect(page.getByTestId("kpi-orders")).toHaveText("20");

    await page.getByLabel("Region", { exact: true }).selectOption({ label: "Not used" });
    await expect(page.getByRole("region", { name: "Revenue by category", exact: true })).toBeVisible();
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "Not used" });
    await expect(page.getByRole("region", { name: "Revenue by channel", exact: true })).toBeVisible();
  });

  test("a dimension filter recomputes the KPIs and charts", async ({ page }) => {
    await openWithFile(page, "sales-small.csv");
    await page.getByLabel("Filter by").selectOption("region");
    await page.getByLabel("Region value").selectOption("CBD");
    await expect(page.getByTestId("kpi-revenue")).toHaveText(SMALL.cbdRevenue);
    await expect(page.getByTestId("kpi-orders")).toHaveText(SMALL.cbdOrders);
    const products = page.getByRole("region", { name: "Top products", exact: true });
    await products.getByRole("button", { name: "Show table" }).click();
    // The 20W charger was only sold outside the CBD.
    await expect(products.getByRole("table")).not.toContainText("20W charger");
    await expect(products.getByRole("table")).toContainText("Infinix Hot 40i");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("kpi-revenue")).toHaveText(SMALL.revenue);
  });

  test("a file with no matching columns asks the user to choose", async ({ page }) => {
    await open(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: "odd.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Foo,Bar\nhello,world\nfoo,bar\n"),
    });
    await expect(page.getByText(/Choose which column holds the Date and Amount/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "What stands out" })).toHaveCount(0);
    await page.getByLabel("Date", { exact: true }).selectOption({ label: "Foo" });
    await page.getByLabel("Amount", { exact: true }).selectOption({ label: "Bar" });
    await expect(page.getByText(/None of the 2 rows had both a readable date/)).toBeVisible();
  });

  test("reads an Excel .xlsx file", async ({ page }) => {
    const errors = trackErrors(page);
    await openWithFile(page, "sales-small.xlsx");
    await expect(page.getByTestId("kpi-revenue")).toHaveText("45,000");
    await expect(page.getByTestId("kpi-orders")).toHaveText("8");
    await expect(page.getByText("3 Mar 2025 to 14 Mar 2025").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("responsive and themes", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`390px wide: no horizontal scroll, ${scheme} mode passes axe`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: scheme });
      const overflow = () =>
        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

      await open(page);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await expectNoA11yViolations(page);

      await page.getByRole("button", { name: "Try with sample data" }).click();
      await expect(page.getByRole("heading", { name: "What stands out" })).toBeVisible({ timeout: 30_000 });
      expect(await overflow()).toBeLessThanOrEqual(0);
      for (const title of CHART_TITLES)
        await page
          .getByRole("region", { name: title, exact: true })
          .getByRole("button", { name: "Show table" })
          .click();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await expectNoA11yViolations(page);
    });
  }

  test("charts use design tokens, so they follow the colour scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openSample(page);
    const stroke = await page
      .getByTestId("revenue-chart")
      .locator("path")
      .evaluateAll((paths) => paths.map((p) => getComputedStyle(p).stroke).find((s) => s.startsWith("rgb")));
    // Dark-mode --chart-1 is #2dd4bf; the light-mode teal would be rgb(15, 118, 110).
    expect(stroke).toBe("rgb(45, 212, 191)");
  });
});
