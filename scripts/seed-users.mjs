// One-time setup script: creates the Parent and Akul auth accounts + profile rows.
// Run with: node --env-file=.env.local scripts/seed-users.mjs
// Requires SUPABASE_SERVICE_ROLE_KEY to be set in .env.local (never commit it).

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase Dashboard -> Project Settings -> API), then re-run.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Must match ROLE_EMAILS in src/lib/roles.ts
const ACCOUNTS = [
  { role: "parent", email: "parent@mission2028.internal", name: "Mom & Dad" },
  { role: "akul", email: "akul@mission2028.internal", name: "Akul" },
];

function generatePassword() {
  return randomBytes(9).toString("base64url"); // 12-char URL-safe password
}

async function findUserByEmail(email) {
  // No direct "get by email" admin method — page through and match.
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  for (const account of ACCOUNTS) {
    let user = await findUserByEmail(account.email);

    if (!user) {
      const password = generatePassword();
      const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { name: account.name, role: account.role },
      });
      if (error) throw error;
      user = data.user;
      console.log(`Created auth user for role "${account.role}"`);
      console.log(`  Password: ${password}`);
    } else {
      console.log(
        `Auth user for role "${account.role}" already exists — skipping creation.`,
      );
    }

    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      role: account.role,
      name: account.name,
    });
    if (upsertError) throw upsertError;
    console.log(`  Profile row ensured for role "${account.role}".`);
  }

  console.log(
    "\nDone. Save the printed passwords somewhere safe — they won't be shown again.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
