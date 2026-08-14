"use server";

import { createClient } from "@/lib/supabase/server";

export type CancelTestResult = { success: true } | { success: false; error: string };

// Only allowed while the test is still "scheduled" — once Akul has started it
// (status flips to "in_progress" on first attempt), it can no longer be
// cancelled from here.
export async function cancelTest(testId: string): Promise<CancelTestResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent") {
    return { success: false, error: "Only parents can cancel tests." };
  }

  const { data: test } = await supabase
    .from("tests")
    .select("id, created_by, status")
    .eq("id", testId)
    .single();

  if (!test) return { success: false, error: "Test not found." };
  if (test.created_by !== user.id) {
    return { success: false, error: "You can only cancel tests you scheduled." };
  }
  if (test.status !== "scheduled") {
    return {
      success: false,
      error: "This test can no longer be cancelled — Akul has already started it.",
    };
  }

  // Re-check status atomically in the delete itself, in case Akul started
  // the test in the moment between the check above and this statement.
  // Only the test row (and its test_questions links) is removed — the
  // generated questions themselves stay in the bank for future reuse.
  const { data: deletedTest, error: deleteTestError } = await supabase
    .from("tests")
    .delete()
    .eq("id", testId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();

  if (deleteTestError) {
    return { success: false, error: "Failed to cancel the test." };
  }
  if (!deletedTest) {
    return {
      success: false,
      error: "This test can no longer be cancelled — Akul has already started it.",
    };
  }

  return { success: true };
}
