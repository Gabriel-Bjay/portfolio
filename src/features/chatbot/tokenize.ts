// Small English + Swahili stopword lists. Question words are included on purpose: they
// appear in every question and say nothing about which section answers it. Words that carry
// meaning in this domain ("saa" = hour, "bei" = price, "open", "time") are NOT listed.
const STOPWORDS = new Set(
  (
    "a an the and or but of to in on at for with from by is are was were be been am do does did " +
    "you your yours we our us i me my it its this that these those what which who whom when where " +
    "why how can could would should will shall may might there here if then than so as not no yes " +
    "please about into any some tell know want need get " +
    // Swahili
    "na ya wa kwa ni la za katika kuwa ambayo hii huu hizi hao yake yao wake wao sana pia au lakini " +
    "kama huo hiyo hizo hapa pale hapo mimi wewe yeye sisi ninyi nini gani ipi yupi si siyo ndiyo " +
    "ndio je tafadhali naomba ngapi wapi lini vipi kuna mna nina una ana tuna wana"
  ).split(" "),
);

const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

/** Very light English stemming (plurals, -ing, trailing e) so "opens", "opening" and "open"
 *  meet. Applied to documents and queries alike, so imperfect stems still match each other.
 *  Swahili tokens mostly pass through unchanged. */
function stem(token: string): string {
  let t = token;
  if (t.length > 4 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && /(ss|x|ch|sh)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) t = t.slice(0, -1);
  if (t.length > 3 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

/** Lowercase, strip accents and punctuation, drop stopwords and one-letter tokens.
 *  Hyphenated words yield the joined form too, so "M-Pesa" matches "mpesa". */
export function tokenize(text: string): string[] {
  const normalised = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  const out: string[] = [];
  for (const word of normalised.match(WORD) ?? []) {
    const parts = word.split(/[-'’]/).filter(Boolean);
    const candidates = parts.length > 1 && word.includes("-") ? [parts.join(""), ...parts] : parts;
    for (const candidate of candidates) {
      if (candidate.length < 2 || STOPWORDS.has(candidate)) continue;
      out.push(stem(candidate));
    }
  }
  return out;
}
