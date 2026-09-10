"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Wordmark } from "@/components/Wordmark";

type Mode = "in" | "up";

/** Spotlight spring state: target, core (fast layer), ambient (slow layer). */
type GlowState = {
  raf: number;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  live: boolean;
};

/**
 * The dark column of the auth pages. `ipad-cursor` replaces the OS cursor only
 * while the pointer is over it (init on enter, dispose on leave).
 *
 * The spotlight is two radial layers driven by a rAF lerp, not a CSS
 * transition: a transition restarts its easing on every mousemove and
 * rubber-bands. The core chases faster than the ambient wash, for depth.
 */
export function AuthAside({ brand = false }: { brand?: boolean }) {
  const asideRef = useRef<HTMLElement | null>(null);
  const glow = useRef<GlowState | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      if (glow.current?.raf) cancelAnimationFrame(glow.current.raf);
    };
  }, []);

  const step = useCallback(function tick() {
    const s = glow.current;
    const el = asideRef.current;
    if (!s || !el) return;
    // Core chases fast, ambient wash trails — two ease rates, one target.
    s.cx += (s.tx - s.cx) * 0.16;
    s.cy += (s.ty - s.cy) * 0.16;
    s.ax += (s.tx - s.ax) * 0.07;
    s.ay += (s.ty - s.ay) * 0.07;
    el.style.setProperty("--gx", `${s.cx}px`);
    el.style.setProperty("--gy", `${s.cy}px`);
    el.style.setProperty("--ax", `${s.ax}px`);
    el.style.setProperty("--ay", `${s.ay}px`);
    const settled =
      Math.abs(s.tx - s.ax) < 0.3 &&
      Math.abs(s.ty - s.ay) < 0.3 &&
      Math.abs(s.tx - s.cx) < 0.3 &&
      Math.abs(s.ty - s.cy) < 0.3;
    s.raf = s.live || !settled ? requestAnimationFrame(tick) : 0;
  }, []);

  const onMove = (e: MouseEvent<HTMLElement>) => {
    if (reduceMotion.current) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (!glow.current) {
      // First contact: snap every layer onto the pointer so the light fades
      // in where the cursor is instead of flying across the panel.
      glow.current = { raf: 0, tx: x, ty: y, cx: x, cy: y, ax: x, ay: y, live: true };
    }
    const s = glow.current;
    s.tx = x;
    s.ty = y;
    s.live = true;
    el.dataset.lit = "true";
    if (!s.raf) s.raf = requestAnimationFrame(step);
  };

  const onEnter = useCallback(async () => {
    const { initCursor } = await import("ipad-cursor");
    initCursor({
      // Roomier box when the pointer melds into a control (e.g. the logo).
      blockPadding: 14,
      enableAutoTextCursor: false,
      normalStyle: {
        width: "26px",
        height: "20px",
        radius: "999px",
        background: "rgba(89, 199, 193, 0.14)",
        border: "1px solid rgba(89, 199, 193, 0.5)",
        durationPosition: "0.12s",
      },
      blockStyle: {
        radius: "auto",
        background: "rgba(89, 199, 193, 0.12)",
        border: "1px solid rgba(89, 199, 193, 0.32)",
      },
    });
  }, []);

  const onLeave = useCallback(async () => {
    const s = glow.current;
    if (s) s.live = false; // let the lerp settle, CSS fades the light out
    asideRef.current?.removeAttribute("data-lit");
    const { disposeCursor } = await import("ipad-cursor");
    disposeCursor();
  }, []);

  return (
    <aside
      ref={asideRef}
      className="auth-aside"
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="auth-glow" aria-hidden />
      {brand && (
        <div className="auth-aside-top">
          <Link href="/welcome" className="auth-brand" data-cursor="block">
            <Wordmark />
          </Link>
        </div>
      )}
      <div className="auth-aside-mid">
        <p className="label auth-aside-kicker mb-5">01 — Precision timekeeping</p>
        <h1 className="serif" style={{ fontSize: "clamp(34px,3.4vw,50px)", lineHeight: 1.03 }}>
          Track time
          <br />
          like an
          <br />
          <em className="italic auth-aside-em">instrument.</em>
        </h1>
        <p className="auth-aside-body mt-5 max-w-sm text-[14.5px] leading-relaxed">
          Project, task, entry. Overlapping timers, exact roll-ups, no clutter.
          Every billable minute lands on the invoice by itself.
        </p>
      </div>
      <ul className="auth-aside-list">
        {[
          "Billable / non-billable, split at the source",
          "Rates locked onto every invoice at generation",
          "DOCX + PDF export — your data stays yours",
        ].map((line) => (
          <li key={line}>
            <span className="auth-tick" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * The split layout of the /login page: the dark editorial column beside the
 * email/password + OAuth form. `topRight` is the "back to site" link.
 */
export function AuthContent({
  mode = "in",
  topRight,
  initialError,
}: {
  mode?: Mode;
  topRight?: ReactNode;
  initialError?: string;
}) {
  return (
    <div className="auth-content">
      <AuthAside brand />
      <div className="auth-formwrap">
        {topRight && <div className="auth-topright">{topRight}</div>}
        <AuthForm key={mode} initialMode={mode} initialError={initialError} />
      </div>
    </div>
  );
}
