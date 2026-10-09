// Shared types for the Mauzo Insights feature. Pure data shapes only.

/** What a spreadsheet column means to the dashboard. `date` and `amount` are required. */
export const ROLES = [
  "date",
  "amount",
  "quantity",
  "product",
  "category",
  "region",
  "channel",
  "customer",
  "orderId",
] as const;
export type Role = (typeof ROLES)[number];

export const REQUIRED_ROLES: readonly Role[] = ["date", "amount"];

export const ROLE_LABELS: Record<Role, string> = {
  date: "Date",
  amount: "Amount",
  quantity: "Quantity",
  product: "Product",
  category: "Category",
  region: "Region",
  channel: "Channel",
  customer: "Customer",
  orderId: "Order ID",
};

/** Role → zero-based column index. A missing key means "not mapped". */
export type Mapping = Partial<Record<Role, number>>;

/** A parsed spreadsheet: trimmed header names and string cells, every row as wide as the header. */
export interface RawTable {
  headers: string[];
  rows: string[][];
}

export type Currency = "KES" | "USD" | "EUR" | "GBP";

/** Dimensions a user can slice or break the data down by. */
export const DIMENSIONS = ["category", "region", "channel"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface Order {
  /** Days since 1970-01-01 (UTC calendar day). Whole numbers only. */
  day: number;
  amount: number;
  quantity?: number;
  product?: string;
  category?: string;
  region?: string;
  channel?: string;
  customer?: string;
  orderId?: string;
}

/** Inclusive range of UTC day numbers. */
export interface DateRange {
  from: number;
  to: number;
}

export type Granularity = "day" | "week" | "month";
