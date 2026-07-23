"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PaddleEvent = { name?: string };
type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (opts: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Checkout: { open: (opts: Record<string, unknown>) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

/**
 * Opens Paddle's overlay checkout for the single paid plan. Env-gated: with no
 * client token or price id it renders a disabled, self-explaining state so the
 * page still works before Paddle sandbox keys are provisioned.
 */
export function UpgradeButton({
  email,
  userId,
  label = "Upgrade — $9/mo",
}: {
  email: string | null;
  userId: string;
  label?: string;
}) {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
  const env = process.env.NEXT_PUBLIC_PADDLE_ENV;
  const configured = Boolean(token && priceId);

  const [ready, setReady] = useState(false);
  const router = useRouter();

  if (!configured) {
    return (
      <button className="btn" disabled>
        Upgrade (checkout not configured)
      </button>
    );
  }

  function init() {
    const Paddle = window.Paddle;
    if (!Paddle) return;
    if (env === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({ token: token!, eventCallback: onPaddleEvent });
    setReady(true);
  }

  // When checkout succeeds, re-fetch the Server Component so the page reflects
  // Pro without a manual reload. The subscription row is provisioned by Paddle's
  // webhook, which lands a beat after the browser event — so refresh a couple of
  // times to cover that lag. Extra refreshes are harmless once it's active.
  function onPaddleEvent(event: PaddleEvent) {
    if (event.name !== "checkout.completed") return;
    window.setTimeout(() => router.refresh(), 1500);
    window.setTimeout(() => router.refresh(), 4000);
  }

  function openCheckout() {
    const Paddle = window.Paddle;
    if (!Paddle) return;
    Paddle.Checkout.open({
      items: [{ priceId: priceId!, quantity: 1 }],
      ...(email ? { customer: { email } } : {}),
      customData: { user_id: userId },
    });
  }

  return (
    <>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={init}
      />
      <button
        type="button"
        className="btn btn-accent"
        onClick={openCheckout}
        disabled={!ready}
      >
        {ready ? label : "Loading checkout…"}
      </button>
    </>
  );
}
