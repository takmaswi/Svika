import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "build/**",
      // V1 — v2 brand reference HTML/JSX files are static design canvases
      // shipped under public/. They render in a sandbox via the brand HTML
      // pages and reference globals declared by sibling files; the project
      // ESLint config is not the right tool to validate them.
      "public/branding/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
];

export default eslintConfig;
