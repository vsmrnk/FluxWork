"use client";

import { useState, useTransition } from "react";
import { quickStart } from "@/app/actions/time";

/** quickStart creates a project and task from whatever the user types. */
export function FirstRunCard() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await quickStart(text, null, { source: "first_run" });
      if (res && "error" in res && res.error) setError(res.error);
    });
  }

  return (
    <div className="panel rise max-w-md mx-auto mt-16 md:mt-24 p-8 text-center">
      <h1 className="serif text-3xl">What are you working on?</h1>
      <p className="text-sm text-ink-2 mt-2">
        Type it and start the timer. You can rename things and set rates later.
      </p>
      <form action={onSubmit} className="mt-6 flex flex-col sm:flex-row gap-2">
        <input
          name="text"
          className="field"
          placeholder="Acme homepage"
          aria-label="What are you working on?"
          autoFocus
          required
          maxLength={120}
        />
        <button type="submit" disabled={pending} className="btn btn-accent shrink-0">
          {pending ? "Starting…" : "Start"}
        </button>
      </form>
      {error && <p className="num text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
