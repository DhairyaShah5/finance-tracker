// Default seed data for a new user, derived from the source Excel workbook's
// canonical dropdown lists. Seeded on first sign-in (see lib/setup.ts).

export const WHOSE_EXPENSE_VALUES = ["My", "Friend", "Group", "Roommates"] as const;
export type WhoseExpense = (typeof WHOSE_EXPENSE_VALUES)[number];

export const ACCOUNT_TYPES = [
  "checking",
  "credit_card",
  "debit_card",
  "savings",
  "cash",
  "investment",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// 16 expense categories (workbook D2:D17) with OKLCH hue angles for charts.
// Needs / Wants / Savings is decided per transaction, not per category.
export const DEFAULT_CATEGORIES: { name: string; color_hue: number }[] = [
  { name: "Rent and Utilities", color_hue: 250 },
  { name: "Groceries", color_hue: 150 },
  { name: "Entertainment", color_hue: 300 },
  { name: "Home Improvement", color_hue: 30 },
  { name: "Transportation", color_hue: 230 },
  { name: "Health Insurance", color_hue: 10 },
  { name: "Eating Out", color_hue: 50 },
  { name: "Shopping", color_hue: 330 },
  { name: "Health & Fitness", color_hue: 170 },
  { name: "Electronics", color_hue: 270 },
  { name: "Personal Care", color_hue: 350 },
  { name: "Investment", color_hue: 140 },
  { name: "Miscellaneous", color_hue: 90 },
  { name: "Gifting", color_hue: 320 },
  { name: "Travelling", color_hue: 200 },
  { name: "Education & Fees", color_hue: 260 },
];

// 6 inflow types (workbook H2:H7). "Reimbursement" was misspelled in the
// source as "Reimbursment" - the import maps the old spelling onto this.
export const DEFAULT_INFLOW_TYPES: { name: string; is_paycheck: boolean }[] = [
  { name: "Personal Deposit", is_paycheck: false },
  { name: "Reimbursement", is_paycheck: false },
  { name: "Cashback", is_paycheck: false },
  { name: "Refund", is_paycheck: false },
  { name: "PayCheck", is_paycheck: true },
  { name: "PayCheck Int", is_paycheck: false },
];

// 6 accounts (workbook Transaction Mode list G2:G7).
export const DEFAULT_ACCOUNTS: {
  name: string;
  bank: string;
  type: AccountType;
  is_credit: boolean;
}[] = [
  { name: "BofA Checking", bank: "BofA", type: "checking", is_credit: false },
  { name: "BofA Credit Card", bank: "BofA", type: "credit_card", is_credit: true },
  { name: "BofA Debit Card", bank: "BofA", type: "debit_card", is_credit: false },
  { name: "Chase Checking", bank: "Chase", type: "checking", is_credit: false },
  { name: "Chase Credit Card", bank: "Chase", type: "credit_card", is_credit: true },
  { name: "Chase Debit Card", bank: "Chase", type: "debit_card", is_credit: false },
];
