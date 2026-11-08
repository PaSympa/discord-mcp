import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "_site/", "live-test*.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["site/**/*.mjs", "scripts/**/*.mjs"],
    ignores: ["site/client/**"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    // Browser code, bundled into _site/assets/. search.mjs and detail.mjs also run at build time.
    files: ["site/client/**/*.mjs"],
    languageOptions: {
      globals: {
        cancelAnimationFrame: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        document: "readonly",
        Event: "readonly",
        history: "readonly",
        HTMLElement: "readonly",
        localStorage: "readonly",
        location: "readonly",
        matchMedia: "readonly",
        navigator: "readonly",
        Node: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
      },
    },
  },
);
