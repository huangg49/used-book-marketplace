import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep the renderer below the per-file budget without pulling the
          // authenticated workspace into the login graph. The budget checker
          // still counts this shared runtime in the complete startup total.
          groups: [
            {
              name: "react-runtime",
              test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
