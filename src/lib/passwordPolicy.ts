// Shared by the auth actions (authoritative check) and the auth forms (live
// feedback), so the rules can't drift apart.

export const PASSWORD_MIN_LENGTH = 8;

const RULES: { id: string; label: string; test: (password: string) => boolean }[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "case",
    label: "Upper & lowercase letters",
    test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  {
    id: "number",
    label: "At least one number",
    test: (p) => /\d/.test(p),
  },
  {
    id: "symbol",
    label: "At least one symbol",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export function evaluatePassword(password: string) {
  return RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(password),
  }));
}

/** A single user-facing error, or null when every rule passes. */
export function validatePassword(password: string): string | null {
  const unmet = RULES.filter((rule) => !rule.test(password));
  if (unmet.length === 0) return null;
  return `Password needs: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`;
}
