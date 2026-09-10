import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Replaces eslint-config-next's default ignores, so they are restated here.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent tooling (installed skills, worktree copies) — not app code.
    ".agents/**",
    ".claude/**",
  ]),
]);
