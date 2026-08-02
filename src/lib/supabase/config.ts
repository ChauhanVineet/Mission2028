// The Supabase URL and anon/publishable key are meant to be public — they're
// embedded in every browser bundle and protected by Row Level Security, not
// secrecy. Env vars can still override these (e.g. pointing at a different
// Supabase project), but these fallbacks mean the app works even if the
// hosting platform hasn't been given the env vars yet.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://djenkdfmvdlmstqwewhh.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZW5rZGZtdmRsbXN0cXdld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2ODIxNjYsImV4cCI6MjEwMTI1ODE2Nn0.Ct8zEXELRwn1n_J2zj5vF2Rn__081JiOBc8t4SmZ374";
