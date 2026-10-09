// Seeded generator for the demo data set: "Duka Digital", a FICTIONAL Nairobi electronics &
// phone-accessories shop. Only plain arithmetic is used (no Math.random, no log/cos) so the same
// seed gives byte-identical output in every browser and in Node.
import Papa from "papaparse";
import type { RawTable } from "./types";
import { dayFromYmd, ymdFromDay } from "./values";

export const SAMPLE_STORE = "Duka Digital";
export const SAMPLE_LABEL = "Duka Digital, a fictional store";
export const SAMPLE_FILE_NAME = "duka-digital-sample.csv";
export const SAMPLE_HEADERS = [
  "Date",
  "Order ID",
  "Product",
  "Category",
  "Region",
  "Channel",
  "Customer",
  "Quantity",
  "Amount (KES)",
] as const;
export const DEFAULT_SEED = 20260101;

/** Roughly 18 months of daily orders, ending on a Sunday so the last week is complete. */
export const SAMPLE_FIRST_DAY = dayFromYmd(2025, 4, 1) as number;
export const SAMPLE_LAST_DAY = dayFromYmd(2026, 9, 20) as number;
export const BLACK_FRIDAY_DAY = dayFromYmd(2025, 11, 28) as number;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately standard normal (Irwin–Hall with four uniforms), arithmetic only. */
function gaussian(rng: Rng): number {
  return (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

interface Product {
  name: string;
  category: string;
  price: number;
  weight: number;
  phone?: boolean;
}

const PRODUCTS: readonly Product[] = [
  { name: "Tecno Spark 20 128GB", category: "Phones", price: 16500, weight: 5, phone: true },
  { name: "Infinix Hot 40i", category: "Phones", price: 14500, weight: 5, phone: true },
  { name: "Samsung Galaxy A15", category: "Phones", price: 22500, weight: 4, phone: true },
  { name: "Itel A70", category: "Phones", price: 9500, weight: 5, phone: true },
  { name: "Redmi 13C", category: "Phones", price: 15500, weight: 3, phone: true },
  { name: "Oraimo FreePods 4", category: "Audio", price: 3200, weight: 8 },
  { name: "JBL Go 3 speaker", category: "Audio", price: 4800, weight: 3 },
  { name: "Wired earphones", category: "Audio", price: 450, weight: 7 },
  { name: "20W fast charger", category: "Charging & Power", price: 1200, weight: 12 },
  { name: "USB-C cable 1m", category: "Charging & Power", price: 350, weight: 14 },
  { name: "Oraimo 10000mAh power bank", category: "Charging & Power", price: 2600, weight: 7 },
  { name: "Car charger dual USB", category: "Charging & Power", price: 850, weight: 3 },
  { name: "Phone case (assorted)", category: "Cases & Protection", price: 600, weight: 13 },
  { name: "Tempered glass screen guard", category: "Cases & Protection", price: 300, weight: 15 },
  { name: "Wireless mouse", category: "Computer Accessories", price: 950, weight: 5 },
  { name: "32GB flash disk", category: "Computer Accessories", price: 850, weight: 6 },
  { name: "128GB microSD card", category: "Computer Accessories", price: 1900, weight: 4 },
];

const SHOP_REGIONS = ["Westlands", "CBD", "Kilimani", "Kasarani", "Thika Road"] as const;
const SHOP_REGION_WEIGHTS = [22, 26, 14, 10, 12] as const;
const ONLINE_REGION = "Online delivery";

const WEEKDAY_FACTOR = [0.9, 0.85, 0.9, 0.95, 1.1, 1.35, 1.15] as const; // Monday … Sunday

/** 0 outside the festive season, rising to 1 around 15–24 December. */
function festiveLevel(month: number, date: number): number {
  if (month !== 12 || date > 24) return 0;
  return Math.min(1, 0.4 + (date / 24) * 0.6);
}

function dayMultiplier(day: number): number {
  const { month, date } = ymdFromDay(day);
  const weekday = (((day + 3) % 7) + 7) % 7;
  let m = WEEKDAY_FACTOR[weekday];
  const festive = festiveLevel(month, date);
  m *= 1 + 0.5 * festive;
  if (month === 12 && date >= 26) m *= 1.1;
  if (month === 1 && date <= 15) m *= 0.88;
  if (day === BLACK_FRIDAY_DAY) m *= 3.2;
  if (day === BLACK_FRIDAY_DAY + 3) m *= 1.4; // Cyber Monday
  return m;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function isoDate(day: number): string {
  const { year, month, date } = ymdFromDay(day);
  return `${year}-${pad(month, 2)}-${pad(date, 2)}`;
}

/** Rows of strings in SAMPLE_HEADERS order, oldest first. Same seed → identical output. */
export function generateSampleRows(seed: number = DEFAULT_SEED): string[][] {
  const rng = mulberry32(seed);
  const rows: string[][] = [];
  const span = SAMPLE_LAST_DAY - SAMPLE_FIRST_DAY;
  const customers: string[] = [];
  let orderNumber = 100000;

  for (let day = SAMPLE_FIRST_DAY; day <= SAMPLE_LAST_DAY; day++) {
    const t = (day - SAMPLE_FIRST_DAY) / span;
    const { month, date } = ymdFromDay(day);
    const festive = festiveLevel(month, date);
    const blackFriday = day === BLACK_FRIDAY_DAY;

    const expected = (13 + 9 * t) * dayMultiplier(day) * (1 + 0.12 * gaussian(rng));
    const orders = Math.max(3, Math.round(expected));
    const onlineShare = 0.08 + 0.12 * t;

    const productWeights = PRODUCTS.map((p) =>
      p.phone ? p.weight * (1 + 0.6 * Math.max(festive, blackFriday ? 1 : 0)) : p.weight,
    );

    for (let i = 0; i < orders; i++) {
      const product = pickWeighted(rng, PRODUCTS, productWeights);
      const online = rng() < onlineShare;
      const region = online ? ONLINE_REGION : pickWeighted(rng, SHOP_REGIONS, SHOP_REGION_WEIGHTS);
      const channel = online
        ? pickWeighted(rng, ["Website", "WhatsApp order"], [6, 4])
        : pickWeighted(rng, ["In-store", "M-Pesa till", "WhatsApp order"], [55, 35, 10]);

      const quantity = product.phone ? (rng() < 0.03 ? 2 : 1) : pickWeighted(rng, [1, 2, 3, 4], [60, 25, 10, 5]);

      let discount = 0;
      if (blackFriday) discount = 0.15;
      else if (rng() < 0.08) discount = 0.05;
      const amount = Math.round((product.price * quantity * (1 - discount)) / 10) * 10;

      // Roughly half of orders come from a returning customer, biased towards early (loyal) ones.
      let customer: string;
      if (customers.length > 0 && rng() < 0.55) {
        const u = rng();
        customer = customers[Math.floor(u * u * customers.length)];
      } else {
        customer = `C-${pad(customers.length + 1, 4)}`;
        customers.push(customer);
      }

      orderNumber++;
      rows.push([
        isoDate(day),
        `DD-${orderNumber}`,
        product.name,
        product.category,
        region,
        channel,
        customer,
        String(quantity),
        String(amount),
      ]);
    }
  }
  return rows;
}

let cached: { seed: number; rows: string[][] } | undefined;

function rowsFor(seed: number): string[][] {
  if (!cached || cached.seed !== seed) cached = { seed, rows: generateSampleRows(seed) };
  return cached.rows;
}

/** The demo data as a parsed table, ready for column detection (no CSV round trip needed). */
export function sampleTable(seed: number = DEFAULT_SEED): RawTable {
  return { headers: [...SAMPLE_HEADERS], rows: rowsFor(seed).map((r) => [...r]) };
}

/** The same data as CSV text, for the "Download sample CSV" link. */
export function sampleCsv(seed: number = DEFAULT_SEED): string {
  return Papa.unparse({ fields: [...SAMPLE_HEADERS], data: rowsFor(seed) }, { newline: "\n" }) + "\n";
}
