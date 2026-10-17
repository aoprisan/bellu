import { defineConfig } from "vite";

// Relative base so the build works at https://<user>.github.io/<repo>/ without hardcoding the repo name.
export default defineConfig({
  base: "./",
});
