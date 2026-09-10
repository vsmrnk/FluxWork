"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics";
import { validatePassword } from "@/lib/passwordPolicy";

const OAUTH_PROVIDERS = ["google", "github"] as const;

export type AuthState = {
  error?: string;
  message?: string;
  /** Drives the "check your inbox" panel. */
  sent?: "reset" | "confirm";
};

// Built from the live request so localhost, preview and production each
// round-trip to themselves; every origin must be in Supabase's Redirect URLs.
async function requestOrigin() {
  const hdrs = await headers();
  return hdrs.get("origin") ?? `https://${hdrs.get("x-forwarded-host") ?? hdrs.get("host")}`;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email) {
    return { error: "Email is required." };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  // With email confirmation on, there is no session yet.
  if (!data.session) {
    return { sent: "confirm" };
  }

  // Only recordable once a session exists, so the RLS insert passes.
  await track(supabase, "signup");

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Supabase (PKCE) returns a provider URL and stores the code verifier in a
 * cookie; the provider then returns to /auth/callback to finish the exchange.
 */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = OAUTH_PROVIDERS.find((p) => p === formData.get("provider"));
  if (!provider) {
    redirect("/login?error=oauth");
  }

  // Only same-origin relative paths — never trust this as an absolute URL.
  const nextRaw = String(formData.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
  }

  redirect(data.url);
}

/** Always reports a neutral success so the form never reveals whether an account exists. */
export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Enter your email to reset your password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/reset-password`,
  });

  // Only rate limits and server failures surface; everything else stays private.
  if (error && error.status === 429) {
    return { error: "Too many requests — give it a minute, then try again." };
  }
  if (error && error.status && error.status >= 500) {
    return { error: error.message };
  }

  return { sent: "reset" };
}

/** Same privacy posture as resetPassword. */
export async function resendConfirmation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Something went wrong — go back and sign up again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error && error.status === 429) {
    return { error: "Too many requests — give it a minute, then try again." };
  }
  if (error && error.status && error.status >= 500) {
    return { error: error.message };
  }

  return { sent: "confirm" };
}

/** Needs the session /auth/confirm established from the recovery link. */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error:
        "Couldn't update your password. Your reset link may have expired — request a new one.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
