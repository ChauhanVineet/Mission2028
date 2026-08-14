export type Role = "parent" | "akul";

// The login UI only ever asks for a role + password, but Supabase Auth
// needs a real email under the hood — these are the accounts' actual
// registered emails, also used to deliver forgot-password OTP codes.
export const ROLE_EMAILS: Record<Role, string> = {
  parent: "mailforvineet@gmail.com",
  akul: "shalini.gzb@gmail.com",
};
