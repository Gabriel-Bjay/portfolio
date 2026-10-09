import { describe, expect, it } from "vitest";
import { rankSections } from "./bm25";
import { chunkKnowledge } from "./chunk";
import { RETRIEVAL } from "./config";
import { getDefaultKnowledge } from "./default-knowledge";
import { contentSize } from "./retrieve";

const knowledge = getDefaultKnowledge();
const sections = chunkKnowledge(knowledge);

describe("Twiga Brew knowledge base", () => {
  it("has about fifteen sections and fits the send-everything budget", () => {
    expect(sections.length).toBeGreaterThanOrEqual(14);
    expect(sections.length).toBeLessThanOrEqual(20);
    expect(contentSize(sections)).toBeLessThanOrEqual(RETRIEVAL.sendAllMaxChars);
  });

  it("is labelled as fictional and uses only the fake till", () => {
    expect(knowledge).toMatch(/fictional demo business/i);
    expect(knowledge).toContain("Till 000000 (demo)");
  });

  it("contains no real-looking phone numbers, emails or links", () => {
    expect(knowledge).not.toMatch(/@/);
    expect(knowledge).not.toMatch(/https?:\/\//);
    expect(knowledge).not.toMatch(/(?:\+?254|\b0[17])[\d\s-]{7,}/);
  });

  it("covers every topic the spec lists", () => {
    const titles = sections.map((s) => s.title).join(" | ").toLowerCase();
    for (const topic of [
      "about",
      "opening hours",
      "public holidays",
      "location",
      "parking",
      "menu",
      "allergens",
      "delivery",
      "payment",
      "reservations",
      "catering",
      "wi-fi",
      "loyalty",
      "refunds",
      "contact",
    ]) {
      expect(titles).toContain(topic);
    }
  });

  it("has no empty or duplicate-titled sections", () => {
    for (const s of sections) expect(s.body.length).toBeGreaterThan(40);
    expect(new Set(sections.map((s) => s.title)).size).toBe(sections.length);
  });

  it("keeps keyword comments out of the displayed text", () => {
    for (const s of sections) expect(s.body).not.toContain("<!--");
  });

  // Offline mode must find the right section for realistic questions, in both languages.
  it.each([
    ["What time do you open on Sunday?", "Opening hours and public holidays"],
    ["Are you open on public holidays?", "Opening hours and public holidays"],
    ["Mnafunga saa ngapi?", "Opening hours and public holidays"],
    ["Do you deliver to Kilimani?", "Delivery zones and fees"],
    ["How much is delivery to Karen", "Delivery zones and fees"],
    ["How do I pay with M-Pesa?", "Ordering and payment"],
    ["Do you accept mpesa", "Ordering and payment"],
    ["Is there free wifi?", "Wi-Fi and working from the café"],
    ["Do you have vegan options?", "Dietary needs and allergens"],
    ["Is there a nut allergy risk", "Dietary needs and allergens"],
    ["Where can I park?", "Location and parking"],
    ["Can I get a refund if my order is wrong?", "Refunds and complaints"],
    ["How does the loyalty card work", "Loyalty card"],
    ["Can you cater for 50 people?", "Catering"],
    ["Can I book a table for 8?", "Reservations and events"],
  ])("answers %j from %j", (question, title) => {
    expect(rankSections(sections, question)[0]?.section.title).toBe(title);
  });

  it("finds menu items by name", () => {
    expect(rankSections(sections, "How much is a cappuccino?")[0].section.title).toBe("Menu: coffee and tea");
    expect(rankSections(sections, "do you have cheesecake")[0].section.title).toBe(
      "Menu: juices, cold drinks and desserts",
    );
    expect(rankSections(sections, "price of the burger")[0].section.title).toBe("Menu: breakfast and mains");
  });
});
