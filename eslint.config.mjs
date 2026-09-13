import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["contracts/**", "cupboard/**", ".next/**", "node_modules/**", "examples/**"],
  },
];

export default eslintConfig;
