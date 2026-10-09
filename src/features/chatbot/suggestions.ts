export type Suggestion = { text: string; lang?: "sw" };

/** Starter questions for the Twiga Brew demo. One is in Swahili on purpose. */
export const SUGGESTIONS: Suggestion[] = [
  { text: "What time do you open on Sunday?" },
  { text: "Mnafunga saa ngapi?", lang: "sw" },
  { text: "Do you deliver to Kilimani?" },
  { text: "What vegan options do you have?" },
  { text: "How do I pay with M-Pesa?" },
];

/** A small made-up FAQ people can load to try the "bring your own FAQ" feature. */
export const SAMPLE_FAQ = `## Opening hours
Zawadi Tailors is open Monday to Saturday, 9:00 to 18:00. We are closed on Sundays.

## Prices
Trouser hemming costs KES 300. Replacing a zip costs KES 500. A made-to-measure shirt costs KES 2,500.

## Turnaround
Alterations are ready in 2 working days. Made-to-measure items take 7 days. Express service (next day) adds KES 400.

## Payment
We accept M-Pesa (Till 000000, demo) and cash. A deposit of 50% is needed for made-to-measure orders.`;
