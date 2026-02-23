import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Unused vars are almost always bugs; leading _ is the conventional escape hatch.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Explicit `any` defeats TypeScript — warn rather than error to allow gradual adoption.
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow the `as unknown as X` double-cast pattern that the OpenAI SDK requires.
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  }
);
