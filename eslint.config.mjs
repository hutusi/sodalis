import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The worker executes src/lib, src/db and src/worker directly with Bun;
    // they must never depend on Next.js or React (src/lib/utils.ts is the
    // one UI helper exempted).
    files: ["src/lib/**", "src/db/**", "src/worker/**"],
    ignores: ["src/lib/utils.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "server-only",
                "@/app/*",
                "@/components/*",
              ],
              message:
                "lib/db/worker must stay framework-free so the worker can run outside Next.js.",
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
