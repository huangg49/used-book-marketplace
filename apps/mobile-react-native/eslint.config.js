const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  globalIgnores(["dist/*", "example/*"]),
  {
    files: ["src/features/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text", "TextInput", "Button", "Modal"],
              message:
                "Use core/ui AppText, TextField/SearchField, Button and Sheet/ConfirmDialog. See docs/design/UI_CODING_RULES.md.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(#[0-9a-fA-F]{3,8}$|rgba?\\()/]",
          message:
            "Use core/ui color tokens; introduce reviewed color roles in the shared theme.",
        },
      ],
    },
  },
]);
