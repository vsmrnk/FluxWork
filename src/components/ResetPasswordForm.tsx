"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updatePassword, type AuthState } from "@/app/auth/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/passwordPolicy";
import { Arrow, LockIcon, PasswordMeter } from "@/components/AuthForm";

const initial: AuthState = {};

/** Shown on /reset-password once the recovery link has established a session. */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState(updatePassword, initial);

  return (
    <div className="auth-formbox">
      <div className="rise">
        <p className="label mb-3">Reset password</p>
        <h2 className="serif auth-heading" style={{ fontSize: "clamp(30px,3.6vw,42px)", lineHeight: 1.04 }}>
          Set a new password
        </h2>
        <p className="text-ink-2 mt-2.5 text-[15px]">
          Choose a strong password — you&apos;ll be signed in right after.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4 mt-6">
        <div>
          <label className="label block mb-2" htmlFor="password">
            New password
          </label>
          <div className="auth-field">
            <LockIcon />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field auth-input"
              placeholder="••••••••"
            />
          </div>
          <PasswordMeter password={password} />
        </div>

        {state.error && (
          <p className="auth-msg auth-msg-error num text-xs" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn btn-accent auth-submit justify-center mt-1"
        >
          {pending ? "Saving…" : "Update password"}
          {!pending && <Arrow />}
        </button>
      </form>

      <p className="text-[12.5px] text-ink-3 leading-relaxed mt-6">
        Link expired or something off?{" "}
        <Link className="auth-swaplink" href="/login">
          Request a new one from sign-in
        </Link>
      </p>
    </div>
  );
}
