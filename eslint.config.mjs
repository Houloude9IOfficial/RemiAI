import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "website/.next/**",
    "out/**",
    "build/**",
    "electron-dist/**",
    "data/**",
    "creations/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
