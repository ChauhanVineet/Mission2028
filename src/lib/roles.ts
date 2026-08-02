export type Role = "parent" | "akul";

// Supabase Auth needs an email under the hood, but the UI only ever asks
// for a role + password — these fixed addresses are never shown to users.
export const ROLE_EMAILS: Record<Role, string> = {
  parent: "parent@mission2028.internal",
  akul: "akul@mission2028.internal",
};
