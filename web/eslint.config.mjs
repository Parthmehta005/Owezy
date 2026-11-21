import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // src/core is pure TypeScript so it can be reused by a future mobile app
    // and tested without a browser or database.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react", "react/*", "react-dom", "react-dom/*",
                "next", "next/*", "server-only",
                "@supabase/*", "@tanstack/*",
                "@/*",
              ],
              message: "src/core must stay framework-free: no React, Next, Supabase or app (@/) imports. Use relative imports within core.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
