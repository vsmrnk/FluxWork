"use client";

import { useActionState, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  signIn,
  signUp,
  signInWithProvider,
  resetPassword,
  resendConfirmation,
  type AuthState,
} from "@/app/auth/actions";
import { PASSWORD_MIN_LENGTH, evaluatePassword } from "@/lib/passwordPolicy";

const initial: AuthState = {};

/** Seconds before the "Resend email" button unlocks again. */
const RESEND_SECONDS = 60;

/** expo-out — matches --auth-ease in globals.css. */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.22V7.04H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.53.1.72-.23.72-.5v-1.9c-2.92.63-3.54-1.25-3.54-1.25-.48-1.21-1.17-1.54-1.17-1.54-.95-.65.07-.64.07-.64 1.06.07 1.61 1.09 1.61 1.09.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.19 0-1.15.41-2.08 1.09-2.82-.11-.27-.47-1.34.1-2.79 0 0 .88-.28 2.88 1.07a10 10 0 0 1 5.25 0c2-1.35 2.88-1.07 2.88-1.07.57 1.45.21 2.52.1 2.79.68.74 1.09 1.67 1.09 2.82 0 4.03-2.46 4.92-4.8 5.18.38.33.71.97.71 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
  </svg>
);

const PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "github", label: "GitHub", Icon: GitHubIcon },
] as const;

const MailIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const LockIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

const MailOpenIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M3 9.5 12 3l9 6.5V19a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19Z" />
    <path d="m3.4 10.2 8.6 6 8.6-6" />
  </svg>
);

export const Arrow = () => (
  <svg className="arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Live checklist that mirrors the server's authoritative password policy. */
export function PasswordMeter({ password }: { password: string }) {
  const checks = evaluatePassword(password);
  const passedCount = checks.filter((c) => c.passed).length;
  return (
    <div className="auth-pwmeter mt-2.5" aria-live="polite">
      <div className="auth-pwbar" data-strength={passedCount}>
        {checks.map((c) => (
          <span key={c.id} data-on={c.passed} />
        ))}
      </div>
      <ul className="auth-pwrules num">
        {checks.map((c) => (
          <li key={c.id} data-on={c.passed}>
            <span aria-hidden>{c.passed ? "✓" : "•"}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const copy = {
  in: {
    title: "Welcome back",
    sub: "Sign in to pick up where your timer left off.",
    cta: "Sign in",
  },
  up: {
    title: "Start tracking free",
    sub: "No card needed — your first invoice is minutes away.",
    cta: "Create account",
  },
} as const;

const headingSize = (compact: boolean) => ({
  fontSize: compact ? "clamp(26px,2.4vw,32px)" : "clamp(30px,3.6vw,42px)",
  lineHeight: 1.04,
});

const ENTER = { duration: 0.34, ease: EASE_OUT };

/**
 * "Check your inbox" confirmation — shared by the reset-link and sign-up
 * activation flows. Echoes the address the email went to, keeps a resend
 * escape hatch behind a cooldown, and always offers a way back.
 */
function SentPanel({
  kind,
  email,
  compact,
  resendAction,
  resendPending,
  resendState,
  onBack,
  onEdit,
}: {
  kind: "reset" | "confirm";
  email: string;
  compact: boolean;
  resendAction: (formData: FormData) => void;
  resendPending: boolean;
  /** Latest resend result — its identity change restarts the cooldown. */
  resendState: AuthState;
  onBack: () => void;
  onEdit?: () => void;
}) {
  // Cooldown is a deadline: armed on mount (covering the send that opened
  // this panel) and re-armed in the resend form's submit handler. A 1s
  // ticker drives the visible countdown.
  const [deadline, setDeadline] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));

  return (
    <div role="status">
      <div className="auth-sent-badge" aria-hidden>
        <MailOpenIcon />
        <span className="auth-sent-ring" />
      </div>
      <p className="label mb-3">{kind === "reset" ? "Reset link sent" : "One step left"}</p>
      <h2 className="serif auth-heading" style={headingSize(compact)}>
        Check your inbox
      </h2>
      <p className="text-ink-2 mt-2.5 text-[15px] leading-relaxed">
        {kind === "reset" ? (
          <>
            If <span className="auth-sent-email">{email}</span> has a FluxWork
            account, a password reset link is on its way. For security it
            expires in about an hour.
          </>
        ) : (
          <>
            We sent an activation link to{" "}
            <span className="auth-sent-email">{email}</span>. Open it to finish
            creating your account.
          </>
        )}
      </p>
      <p className="text-ink-3 mt-4 text-[13px] leading-relaxed">
        Nothing yet? It can take a minute — check your spam folder, or resend
        below.
      </p>

      {resendState.error && (
        <p className="auth-msg auth-msg-error num mt-4 text-xs" role="alert">
          {resendState.error}
        </p>
      )}

      <form
        action={resendAction}
        onSubmit={() => setDeadline(Date.now() + RESEND_SECONDS * 1000)}
        className="mt-5"
      >
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={left > 0 || resendPending}
          className="btn auth-submit justify-center"
        >
          {resendPending
            ? "Sending…"
            : left > 0
              ? `Resend email in ${left}s`
              : "Resend email"}
        </button>
      </form>

      <p className={`text-[12.5px] text-ink-3 leading-relaxed ${compact ? "mt-4" : "mt-6"}`}>
        {kind === "reset" && onEdit && (
          <>
            Wrong address?{" "}
            <button type="button" className="auth-swaplink" onClick={onEdit}>
              Use a different email
            </button>
            {" · "}
          </>
        )}
        <button type="button" className="auth-swaplink" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </div>
  );
}

/**
 * Forgot-password flow: the email-only request form, then the sent panel.
 * Owns its own action state so a stale sign-in error can never bleed in.
 */
function ResetPane({
  compact,
  email,
  onEmailChange,
  onBack,
  yOffset,
}: {
  compact: boolean;
  email: string;
  onEmailChange: (v: string) => void;
  onBack: () => void;
  yOffset: number;
}) {
  const [state, formAction, pending] = useActionState(resetPassword, initial);
  // Sticky: once a link went out, stay on the sent panel even if a later
  // resend attempt comes back with only a rate-limit error. Adjusted during
  // render (not in an effect) so the swap commits in the same pass.
  const [sentOnce, setSentOnce] = useState(false);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.sent) {
      setSentOnce(true);
      setEditing(false);
    }
  }

  const showSent = sentOnce && !editing;

  // No AnimatePresence here: this swap is driven by useActionState inside a
  // React action transition, where mode="wait" exit choreography stalls and
  // leaves the pane empty. Keyed remounts with entrance-only motion instead.
  return (
    <div>
      {showSent ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0, transition: ENTER }}
        >
          <SentPanel
            kind="reset"
            email={email}
            compact={compact}
            resendAction={formAction}
            resendPending={pending}
            resendState={state}
            onBack={onBack}
            onEdit={() => setEditing(true)}
          />
        </motion.div>
      ) : (
        <motion.div
          key={`form-${sentOnce ? "back" : "first"}`}
          initial={sentOnce ? { opacity: 0, y: yOffset } : false}
          animate={{ opacity: 1, y: 0, transition: ENTER }}
        >
          <p className="label mb-3">Reset password</p>
          <h2 className="serif auth-heading" style={headingSize(compact)}>
            Reset your password
          </h2>
          <p className="text-ink-2 mt-2.5 text-[15px]">
            Enter your email and we&apos;ll send a link to set a new one.
          </p>

          <form action={formAction} className={`flex flex-col gap-4 ${compact ? "mt-5" : "mt-6"}`}>
            <div>
              <label className="label block mb-2" htmlFor="reset-email">
                Email
              </label>
              <div className="auth-field">
                <MailIcon />
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="field auth-input"
                  placeholder="you@studio.com"
                />
              </div>
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
              {pending ? "Sending…" : "Send reset link"}
              {!pending && <Arrow />}
            </button>
          </form>

          <p className={`text-[12.5px] text-ink-3 leading-relaxed ${compact ? "mt-4" : "mt-6"}`}>
            Remembered it?{" "}
            <button type="button" className="auth-swaplink" onClick={onBack}>
              Back to sign in
            </button>
          </p>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Sign in / create account: mode tabs, credentials form, OAuth. After a
 * sign-up that needs email confirmation it becomes the activation sent panel.
 */
function SignPane({
  initialMode,
  compact,
  initialError,
  next,
  email,
  onEmailChange,
  onForgot,
  onRestart,
  yOffset,
}: {
  initialMode: "in" | "up";
  compact: boolean;
  initialError?: string;
  next: string;
  email: string;
  onEmailChange: (v: string) => void;
  onForgot: () => void;
  /** Remounts this pane fresh at sign-in (used from the sent panel). */
  onRestart: () => void;
  yOffset: number;
}) {
  const [mode, setMode] = useState<"in" | "up">(initialMode);
  const [password, setPassword] = useState("");
  const action = mode === "in" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, initial);
  const [resendState, resendAction, resendPending] = useActionState(
    resendConfirmation,
    initial,
  );
  const t = copy[mode];
  // Show the redirect error until the user submits the form themselves.
  const error = state.error ?? (state === initial ? initialError : undefined);

  const sent = state.sent === "confirm";

  // Same as ResetPane: action-transition-driven swap, so no AnimatePresence.
  return (
    <div>
      {sent ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0, transition: ENTER }}
        >
          <SentPanel
            kind="confirm"
            email={email}
            compact={compact}
            resendAction={resendAction}
            resendPending={resendPending}
            resendState={resendState}
            onBack={onRestart}
          />
        </motion.div>
      ) : (
        <motion.div key="form">
          <p className="label mb-3">{mode === "in" ? "Sign in" : "Get started"}</p>
          <h2 className="serif auth-heading" style={headingSize(compact)}>
            {t.title}
          </h2>
          <p className="text-ink-2 mt-2.5 text-[15px]">{t.sub}</p>

          {/* Segmented mode control with a sliding pill */}
          <div
            className={`auth-seg ${compact ? "mt-5" : "mt-7"}`}
            data-mode={mode}
            role="tablist"
            aria-label="Authentication mode"
          >
            <span className="auth-seg-pill" aria-hidden />
            <button
              type="button"
              role="tab"
              aria-selected={mode === "in"}
              data-active={mode === "in"}
              onClick={() => setMode("in")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "up"}
              data-active={mode === "up"}
              onClick={() => setMode("up")}
            >
              Create account
            </button>
          </div>

          <form action={formAction} className={`flex flex-col gap-4 ${compact ? "mt-5" : "mt-6"}`}>
            <div>
              <label className="label block mb-2" htmlFor="email">
                Email
              </label>
              <div className="auth-field">
                <MailIcon />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="field auth-input"
                  placeholder="you@studio.com"
                />
              </div>
            </div>

            <div>
              <label className="label block mb-2" htmlFor="password">
                Password
              </label>
              <div className="auth-field">
                <LockIcon />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "up" ? PASSWORD_MIN_LENGTH : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field auth-input"
                  placeholder="••••••••"
                />
              </div>
              {mode === "up" && <PasswordMeter password={password} />}
              {mode === "in" && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    className="auth-swaplink text-[12.5px]"
                    onClick={onForgot}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p className="auth-msg auth-msg-error num text-xs" role="alert">
                {error}
              </p>
            )}
            {state.message && (
              <p className="auth-msg num text-xs" role="status">
                {state.message}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn btn-accent auth-submit justify-center mt-1"
            >
              {pending ? "One moment…" : t.cta}
              {!pending && <Arrow />}
            </button>
          </form>

          <div className={`auth-divider ${compact ? "my-4" : "my-5"}`}>
            <span>or continue with</span>
          </div>

          <div className="auth-social">
            {PROVIDERS.map(({ id, label, Icon }) => (
              <form key={id} action={signInWithProvider}>
                <input type="hidden" name="provider" value={id} />
                <input type="hidden" name="next" value={next} />
                <button
                  type="submit"
                  className="btn auth-social-btn w-full justify-center"
                  aria-label={`Continue with ${label}`}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              </form>
            ))}
          </div>

          <p className={`text-[12.5px] text-ink-3 leading-relaxed ${compact ? "mt-4" : "mt-6"}`}>
            By continuing you agree that your data stays yours — FluxWork never
            sells or shares it.{" "}
            {mode === "in" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className="auth-swaplink"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? "Create a free account" : "Sign in instead"}
            </button>
          </p>
        </motion.div>
      )}
    </div>
  );
}

/**
 * The reusable email/password auth surface: sign-in / sign-up, the
 * forgot-password flow, and the check-your-inbox confirmations, with
 * motion/react transitions between every step. The email field is shared
 * across steps so an address typed once carries through the whole flow.
 */
export function AuthForm({
  initialMode = "in",
  compact = false,
  initialError,
  next = "/",
}: {
  initialMode?: "in" | "up";
  compact?: boolean;
  /** Error surfaced from a redirect (e.g. ?error=oauth), shown until resubmit. */
  initialError?: string;
  /** Post-login destination, forwarded through the OAuth round-trip. */
  next?: string;
}) {
  const [view, setView] = useState<"auth" | "reset">("auth");
  const [email, setEmail] = useState("");
  // Bumping the key remounts the sign pane with pristine action state — the
  // only way back to the form once useActionState has settled on "sent".
  const [authKey, setAuthKey] = useState(0);
  // False until the first in-form navigation, so the initial page load rises
  // once via the CSS cascade instead of double-animating.
  const [navigated, setNavigated] = useState(false);
  const reduce = useReducedMotion();
  const dx = reduce ? 0 : 26;
  const dy = reduce ? 0 : 16;

  // Entrance-only keyed swaps, no AnimatePresence: exit choreography proved
  // unreliable around React 19 action transitions (mode="wait" can strand an
  // empty pane), and an auth form must never disappear. The 340ms expo-out
  // slide on the incoming pane carries the direction cue on its own.
  return (
    <div className="auth-formbox">
      {view === "reset" ? (
        <motion.div
          key="reset"
          initial={{ opacity: 0, x: dx }}
          animate={{ opacity: 1, x: 0, transition: ENTER }}
        >
          <ResetPane
            compact={compact}
            email={email}
            onEmailChange={setEmail}
            onBack={() => setView("auth")}
            yOffset={dy}
          />
        </motion.div>
      ) : (
        <motion.div
          key={`auth-${authKey}`}
          initial={navigated ? { opacity: 0, x: -dx } : false}
          animate={{ opacity: 1, x: 0, transition: ENTER }}
        >
          <SignPane
            initialMode={initialMode}
            compact={compact}
            initialError={initialError}
            next={next}
            email={email}
            onEmailChange={setEmail}
            onForgot={() => {
              setNavigated(true);
              setView("reset");
            }}
            onRestart={() => setAuthKey((k) => k + 1)}
            yOffset={dy}
          />
        </motion.div>
      )}
    </div>
  );
}
