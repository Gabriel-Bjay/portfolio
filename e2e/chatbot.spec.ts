import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

// These tests run against the offline fallback (no GEMINI_API_KEY), which is deterministic.
// With a key configured the real model answers, so the offline-only tests are skipped.
const hasKey = Boolean(process.env.GEMINI_API_KEY);

// The API limits requests per client address (10 a minute). Tests share one machine, so each
// test presents its own address, as a reverse proxy would.
function fakeAddress(): string {
  const n = randomUUID().replace(/-/g, "");
  return `10.${parseInt(n.slice(0, 2), 16)}.${parseInt(n.slice(2, 4), 16)}.${parseInt(n.slice(4, 6), 16)}`;
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": fakeAddress() });
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const SOURCES = [
  { id: "S1", title: "Opening hours and public holidays" },
  { id: "S2", title: "Menu: coffee and tea" },
];

/** Replaces POST /api/chat with a canned reply. The mode probe (GET) still reaches the server. */
async function mockChat(
  page: Page,
  reply: (route: Route, call: number) => Promise<void>,
): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    calls += 1;
    return reply(route, calls);
  });
  return { calls: () => calls };
}

const textReply = (body: string, mode: "ai" | "fallback" = "ai") => ({
  status: 200,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "x-jibu-mode": mode,
    "x-jibu-sources": encodeURIComponent(JSON.stringify(SOURCES)),
  },
  body,
});

test.describe("chatbot page", () => {
  test("loads cleanly in light and dark mode", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/chatbot");
    await expect(page.getByRole("heading", { level: 1, name: "Jibu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chat with Jibu" })).toBeVisible();
    await expect(page.getByText("fictional demo business").first()).toBeVisible();
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("shows the knowledge base as collapsible sections", async ({ page }) => {
    await page.goto("/chatbot");
    const section = page.locator("details", { hasText: "Opening hours and public holidays" });
    await expect(section).toBeVisible();
    await expect(section).not.toHaveAttribute("open", "");
    await section.getByText("Opening hours and public holidays").click();
    await expect(section.getByText("Sunday: opens at 8:00, closes at 20:00")).toBeVisible();
  });

  test("offers a Swahili starter question", async ({ page }) => {
    await page.goto("/chatbot");
    await expect(page.getByRole("button", { name: "Mnafunga saa ngapi?" })).toBeVisible();
  });

  test("shows the install snippet with a copy button", async ({ page }) => {
    await page.goto("/chatbot");
    await expect(page.getByText("/chat-widget.js", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy snippet" })).toBeVisible();
  });
});

test.describe("offline mode", () => {
  test.skip(hasKey, "needs the offline fallback; GEMINI_API_KEY is set");

  test("answers 'What time do you open on Sunday?' with the hours section and a source chip", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/chatbot");
    await expect(page.getByRole("status").filter({ hasText: "Offline mode: showing best-matching FAQ section" })).toBeVisible();

    await page.getByRole("button", { name: "What time do you open on Sunday?" }).click();

    const log = page.getByRole("log");
    await expect(log.getByText("Sunday: opens at 8:00, closes at 20:00")).toBeVisible();
    await expect(log.getByText("I can't reach the AI right now")).toBeVisible();
    await expect(log.getByRole("list", { name: "Sources" }).getByText("Opening hours and public holidays")).toBeVisible();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("answers a Swahili question from the English knowledge base", async ({ page }) => {
    await page.goto("/chatbot");
    await page.getByRole("button", { name: "Mnafunga saa ngapi?" }).click();
    await expect(page.getByRole("log").getByText("closes at 21:00")).toBeVisible();
  });

  test("Enter sends, Shift+Enter adds a line, and the counter stops at 1,000", async ({ page }) => {
    await page.goto("/chatbot");
    const box = page.getByLabel("Your message");
    await box.fill("do you deliver to Kilimani");
    await box.press("Shift+Enter");
    await box.pressSequentially("please");
    await expect(box).toHaveValue("do you deliver to Kilimani\nplease");

    await box.press("Enter");
    await expect(box).toHaveValue("");
    await expect(page.getByRole("log").getByText("Zone 2 (Kilimani")).toBeVisible();

    await box.fill("x".repeat(1_200));
    await expect(box).toHaveValue("x".repeat(1_000));
    await expect(page.getByText("1000/1000")).toBeVisible();
    await expect(page.getByText("Limit reached")).toBeVisible();
  });

  test("a custom FAQ replaces the knowledge and reset restores the café", async ({ page }) => {
    await page.goto("/chatbot");
    const box = page.getByLabel("Your message");
    const log = page.getByRole("log");

    await page.getByRole("button", { name: "Fill with an example" }).click();
    await page.getByRole("button", { name: "Use my FAQ" }).click();
    await expect(page.getByText("Now answering from your FAQ (4 sections)")).toBeVisible();
    await expect(page.getByText("Your FAQ · 4 sections")).toBeVisible();

    await box.fill("how much to replace a zip?");
    await box.press("Enter");
    await expect(log.getByText("Replacing a zip costs KES 500")).toBeVisible();
    await expect(log.getByRole("list", { name: "Sources" }).getByText("Prices")).toBeVisible();

    await page.getByRole("button", { name: "Reset to Twiga Brew" }).click();
    await expect(page.getByText("Currently answering from Twiga Brew Café")).toBeVisible();
    await expect(log.getByText("Replacing a zip")).toHaveCount(0); // the conversation restarted

    await box.fill("What time do you open on Sunday?");
    await box.press("Enter");
    await expect(log.getByText("Sunday: opens at 8:00, closes at 20:00")).toBeVisible();
  });

  test("New chat clears the conversation", async ({ page }) => {
    await page.goto("/chatbot");
    await page.getByRole("button", { name: "Mnafunga saa ngapi?" }).click();
    await expect(page.getByRole("log").getByText("closes at 21:00")).toBeVisible();
    await page.getByRole("button", { name: "New chat" }).click();
    await expect(page.getByRole("log").getByText("closes at 21:00")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mnafunga saa ngapi?" })).toBeVisible();
  });
});

test.describe("states", () => {
  test("shows a typing indicator while waiting, then the streamed answer", async ({ page }) => {
    await mockChat(page, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.fulfill(textReply("We open at **8:00** [S1]."));
    });
    await page.goto("/chatbot");
    await page.getByLabel("Your message").fill("hours?");
    await page.getByLabel("Your message").press("Enter");
    await expect(page.getByText("Jibu is typing")).toBeVisible();
    await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible();
    await expect(page.getByRole("log").getByText("We open at")).toBeVisible();
    await expect(page.getByText("Jibu is typing")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /^Mode: AI$/ })).toBeVisible();
  });

  test("stop keeps the request from completing and marks the reply as stopped", async ({ page }) => {
    await mockChat(page, async (route) => {
      await new Promise((r) => setTimeout(r, 2_500));
      await route.fulfill(textReply("too late")).catch(() => undefined);
    });
    await page.goto("/chatbot");
    await page.getByLabel("Your message").fill("hours?");
    await page.getByLabel("Your message").press("Enter");
    await page.getByRole("button", { name: /Stop/ }).click();
    await expect(page.getByRole("log").getByText("Stopped")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("an error offers Retry, which re-sends the same question", async ({ page }) => {
    const mock = await mockChat(page, async (route, call) => {
      if (call === 1) return route.fulfill({ status: 500, json: { error: "boom" } });
      return route.fulfill(textReply("Back online [S1]."));
    });
    await page.goto("/chatbot");
    const log = page.getByRole("log");
    await page.getByLabel("Your message").fill("hours?");
    await page.getByLabel("Your message").press("Enter");
    await expect(log.getByText("Something went wrong on our side")).toBeVisible();

    await log.getByRole("button", { name: "Retry" }).click();
    await expect(log.getByText("Back online")).toBeVisible();
    await expect(log.getByText("hours?")).toHaveCount(1); // not duplicated
    expect(mock.calls()).toBe(2);
  });

  test("a rate-limit response tells the person how long to wait", async ({ page }) => {
    await mockChat(page, (route) =>
      route.fulfill({ status: 429, headers: { "retry-after": "42" }, json: { error: "slow down" } }),
    );
    await page.goto("/chatbot");
    await page.getByLabel("Your message").fill("hours?");
    await page.getByLabel("Your message").press("Enter");
    await expect(page.getByRole("log").getByText("try again in 42 seconds")).toBeVisible();
  });

  test("AI answers show only the sources they cite, as inline chips and source chips", async ({ page }) => {
    await mockChat(page, (route) => route.fulfill(textReply("Open from 7:00 [S1]. Out of range [S9].")));
    await page.goto("/chatbot");
    await page.getByLabel("Your message").fill("hours?");
    await page.getByLabel("Your message").press("Enter");
    const log = page.getByRole("log");
    await expect(log.getByText("Open from 7:00")).toBeVisible();
    const chips = log.getByRole("list", { name: "Sources" }).getByRole("listitem");
    await expect(chips).toHaveText(["Opening hours and public holidays"]);
    await expect(log.getByText("Source S1")).toBeVisible();
    await expect(log.getByText("S9")).toHaveCount(0);
  });
});

test.describe("safe rendering", () => {
  test("model output is shown as text and never becomes markup", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    let dialogs = 0;
    page.on("dialog", async (d) => {
      dialogs += 1;
      await d.dismiss();
    });
    const hostile = [
      '<img src=x onerror="alert(1)">',
      "<script>alert(2)</script>",
      "[link](javascript:alert(3))",
      "**bold** and a list:",
      "- <b>one</b>",
      "- two [S1]",
    ].join("\n");
    await mockChat(page, (route) => route.fulfill(textReply(hostile)));
    await page.goto("/chatbot");
    await page.getByLabel("Your message").fill("test");
    await page.getByLabel("Your message").press("Enter");

    const log = page.getByRole("log");
    await expect(log.getByText('<img src=x onerror="alert(1)">')).toBeVisible();
    await expect(log.getByText("<script>alert(2)</script>")).toBeVisible();
    await expect(log.getByText("[link](javascript:alert(3))")).toBeVisible();
    await expect(log.locator("img, script, a, iframe")).toHaveCount(0);
    await expect(log.locator("strong", { hasText: "bold" })).toBeVisible(); // allowed formatting works
    await expect(log.locator("ul:not([aria-label]) li")).toHaveCount(2);
    await expect(log.getByText("<b>one</b>")).toBeVisible();
    expect(dialogs).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe("embeddable widget", () => {
  test("opens and closes with the mouse, and Escape closes it and returns focus", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/chatbot");
    const launcher = page.getByRole("button", { name: "Chat with Twiga Brew" });
    await expect(launcher).toHaveAttribute("aria-expanded", "false");

    await launcher.click();
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    const chat = page.frameLocator('iframe[title="Twiga Brew chat"]');
    await expect(chat.getByLabel("Your message")).toBeVisible();
    await expect(chat.getByLabel("Your message")).toBeFocused();

    // Escape pressed inside the iframe reaches the host page through the bridge.
    await page.keyboard.press("Escape");
    await expect(launcher).toHaveAttribute("aria-expanded", "false");
    await expect(launcher).toBeFocused();

    await launcher.click();
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    await launcher.click();
    await expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
  });

  test("works from the keyboard", async ({ page }) => {
    await page.goto("/chatbot");
    const launcher = page.getByRole("button", { name: "Chat with Twiga Brew" });
    await launcher.focus();
    await page.keyboard.press("Enter");
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    await launcher.focus();
    await page.keyboard.press("Escape"); // Escape on the page itself
    await expect(launcher).toHaveAttribute("aria-expanded", "false");
    await expect(launcher).toBeFocused();
    await page.keyboard.press("Space");
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
  });

  test("keeps the conversation when closed and reopened", async ({ page }) => {
    test.skip(hasKey, "needs the offline fallback; GEMINI_API_KEY is set");
    await page.goto("/chatbot");
    const launcher = page.getByRole("button", { name: "Chat with Twiga Brew" });
    await launcher.click();
    const chat = page.frameLocator('iframe[title="Twiga Brew chat"]');
    await chat.getByRole("button", { name: "Mnafunga saa ngapi?" }).click();
    await expect(chat.getByRole("log").getByText("closes at 21:00")).toBeVisible();
    await launcher.click();
    await launcher.click();
    await expect(chat.getByRole("log").getByText("closes at 21:00")).toBeVisible();
  });

  test("adds one launcher and no globals even when included twice", async ({ page }) => {
    await page.goto("/chatbot");
    await expect(page.getByRole("button", { name: "Chat with Twiga Brew" })).toBeVisible();
    await page.evaluate(() => {
      const again = document.createElement("script");
      again.src = "/chat-widget.js";
      again.dataset.title = "Second";
      document.body.appendChild(again);
    });
    await expect(page.locator("script[src='/chat-widget.js']")).toHaveCount(2);
    await expect(page.locator("[data-jibu-widget]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Chat with Second" })).toHaveCount(0);
    const leaked = await page.evaluate(() => Object.keys(window).filter((k) => /jibu|widget/i.test(k)));
    expect(leaked).toEqual([]);
  });

  test("stays within the screen at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chatbot");
    await page.getByRole("button", { name: "Chat with Twiga Brew" }).click();
    const frame = page.locator('iframe[title="Twiga Brew chat"]');
    await expect(frame).toBeVisible();
    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });

  test("the embed page has no site header, is accessible and takes its title and colour from the URL", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto("/chatbot/embed?title=Cafe%20Demo&color=7c3aed");
    await expect(page.getByRole("heading", { level: 1, name: "Cafe Demo" })).toBeVisible();
    await expect(page.getByLabel("Your message")).toBeVisible();
    await expect(page.locator("body > header")).toBeHidden();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCSS("background-color", "rgb(124, 58, 237)");
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("the embed page ignores an invalid colour and shows markup in the title as text", async ({ page }) => {
    await page.goto("/chatbot/embed?color=red%3Bbackground%3Aurl(x)&title=%3Cb%3Ex");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("<b>x");
    await expect(page.getByRole("button", { name: "Send" })).not.toHaveCSS("background-color", "rgb(255, 0, 0)");
  });
});

test.describe("layout", () => {
  test("has no horizontal scroll at 390px, with a conversation open, in both colour schemes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chatbot");
    await page.getByLabel("Your message").fill("do you deliver to Kilimani");
    await page.getByLabel("Your message").press("Enter");
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});

test.describe("POST /api/chat", () => {
  const headers = () => ({ "content-type": "application/json", "x-forwarded-for": fakeAddress() });

  test("rejects invalid bodies with a 400 JSON error", async ({ request }) => {
    const h = headers();
    const bodies: (string | object)[] = [
      "{not json",
      "[]",
      {},
      { messages: [] },
      { messages: [{ role: "user", content: "" }] },
      { messages: [{ role: "system", content: "hi" }] },
      { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] },
      { messages: [{ role: "user", content: "x".repeat(1_001) }] },
      { messages: [{ role: "user", content: "hi" }], knowledge: "x".repeat(20_001) },
    ];
    for (const data of bodies) {
      const res = await request.post("/api/chat", { headers: h, data: typeof data === "string" ? data : JSON.stringify(data) });
      expect(res.status(), JSON.stringify(data).slice(0, 80)).toBe(400);
      expect(res.headers()["content-type"]).toContain("application/json");
      expect(typeof (await res.json()).error).toBe("string");
    }
  });

  test("answers 429 with Retry-After on the 11th request in a minute", async ({ request }) => {
    const h = headers(); // invalid bodies count too, and cost nothing
    for (let i = 1; i <= 10; i += 1) {
      const res = await request.post("/api/chat", { headers: h, data: "{}" });
      expect(res.status(), `request ${i}`).toBe(400);
    }
    const limited = await request.post("/api/chat", { headers: h, data: "{}" });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await limited.json()).error).toMatch(/too many/i);
    // Another client is unaffected.
    const other = await request.post("/api/chat", { headers: headers(), data: "{}" });
    expect(other.status()).toBe(400);
  });

  test("returns the best section, mode and sources in headers when offline", async ({ request }) => {
    test.skip(hasKey, "needs the offline fallback; GEMINI_API_KEY is set");
    const res = await request.post("/api/chat", {
      headers: headers(),
      data: { messages: [{ role: "user", content: "What time do you open on Sunday?" }] },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-jibu-mode"]).toBe("fallback");
    expect(JSON.parse(decodeURIComponent(res.headers()["x-jibu-sources"]))).toEqual([
      { id: "S1", title: "Opening hours and public holidays" },
    ]);
    expect(await res.text()).toContain("Sunday: opens at 8:00, closes at 20:00");
  });

  test("never exposes the API key", async ({ request }) => {
    const res = await request.get("/api/chat");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/"mode":"(ai|fallback)"/);
    expect(body).not.toMatch(/key/i);
  });
});
