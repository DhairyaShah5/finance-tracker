// Dev seeder: parse the source workbook and import it for a user, bypassing
// RLS with the service-role key. Prefer the in-app importer (Settings page) for
// normal use; this is for quickly loading real data during development.
//
// Usage:
//   SEED_EMAIL=you@example.com npx tsx scripts/seed-from-xlsx.ts
//   SEED_USER_ID=<uuid>        npx tsx scripts/seed-from-xlsx.ts
//   XLSX_PATH=/path/to.xlsx    SEED_EMAIL=... npx tsx scripts/seed-from-xlsx.ts

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { parseWorkbook } from "../src/lib/import-parse";
import { importParsedWorkbook } from "../src/lib/import-apply";

// --- minimal .env.local loader (no dotenv dependency) ---
try {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  /* .env.local optional */
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve target user.
  let userId = process.env.SEED_USER_ID;
  const email = process.env.SEED_EMAIL;
  if (!userId && email) {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      console.error(`No user found with email ${email}. Create the account first (sign up in the app).`);
      process.exit(1);
    }
    userId = user.id;
  }
  if (!userId) {
    console.error("Set SEED_EMAIL or SEED_USER_ID to target a user.");
    process.exit(1);
  }

  const xlsxPath = process.env.XLSX_PATH
    ? new URL(`file://${process.env.XLSX_PATH}`)
    : new URL("../data/Final_Dynamic_Finance_Tracker.xlsx", import.meta.url);
  const buf = readFileSync(xlsxPath);

  const parsed = parseWorkbook(buf);
  if (parsed.warnings.length) console.warn("Warnings:", parsed.warnings);

  const result = await importParsedWorkbook(supabase, userId, parsed, { replace: true });
  console.log("Seed complete for user", userId);
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
