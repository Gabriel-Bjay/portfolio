// Screenshots routes at desktop + mobile, light + dark, and reports console errors.
//
//   node scripts/screenshot.mjs <baseUrl> <outDir> /route [/route ...]
//
// Writes <outDir>/<route>-<viewport>-<scheme>.png and prints one line per shot.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [baseUrl, outDir, ...routes] = process.argv.slice(2);
if (!baseUrl || !outDir || routes.length === 0) {
  console.error("usage: node scripts/screenshot.mjs <baseUrl> <outDir> /route [/route ...]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
};

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
let failed = false;
for (const route of routes) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        colorScheme: scheme,
      });
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(baseUrl + route, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
      const file = join(outDir, `${slug}-${vpName}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const notes = [
        overflow && "HORIZONTAL OVERFLOW",
        errors.length && `console errors: ${errors.slice(0, 3).join(" | ")}`,
      ].filter(Boolean);
      if (notes.length) failed = true;
      console.log(`${file}${notes.length ? "  ⚠ " + notes.join("; ") : ""}`);
      await page.close();
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
