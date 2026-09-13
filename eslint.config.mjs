import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// `eslint-config-next` ships a FLAT config array and is imported directly.
//
// This file previously routed it through `FlatCompat` from `@eslint/eslintrc`,
// which is the legacy-to-flat shim. That shim runs the old config validator,
// and the validator calls `JSON.stringify` on the config object. The modern
// config contains circular plugin references (plugins.react closes the cycle),
// so every `npm run lint` died with "Converting circular structure to JSON"
// before reading a single file.
//
// The effect was that NO static analysis ran on this repo at all, locally or in
// CI, and the build stayed green the whole time because linting is not part of
// the build. Verified by introspection rather than docs: importing
// `eslint-config-next/core-web-vitals` returns an array of 4 flat config
// objects, so no compatibility layer is needed.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "_shots/**",
    ],
  },
];

export default eslintConfig;
