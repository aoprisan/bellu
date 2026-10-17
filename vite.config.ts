import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the build works at https://<user>.github.io/<repo>/ without hardcoding the repo name.
export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Bellu Grave Finder",
        short_name: "Bellu",
        description: "Search notable graves in Cimitirul Bellu (Bucharest) and find their plot on the cemetery plan. Works offline.",
        lang: "en",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#f3f2ee",
        theme_color: "#5a4a2f",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell, JS/CSS and the plan image are precached so the app works offline in the cemetery.
        globPatterns: ["**/*.{html,js,css,jpg,png,svg}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
