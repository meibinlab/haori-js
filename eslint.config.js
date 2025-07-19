import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        HTMLScriptElement: "readonly",
        console: "readonly"
      }
    },
    rules: {
      // Google JavaScript Style Guide rules
      "max-len": ["error", { "code": 80 }],
      "indent": ["error", 2],
      "quotes": ["error", "single"],
      "semi": ["error", "always"],
      "comma-dangle": ["error", "always-multiline"],
      "object-curly-spacing": ["error", "never"],
      "array-bracket-spacing": ["error", "never"],
      "space-before-function-paren": ["error", "never"],
      "keyword-spacing": ["error"],
      "space-infix-ops": ["error"],
      "eol-last": ["error"],
      "no-trailing-spaces": ["error"],
      
      // TypeScript specific
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);