import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// CareerBridge frontend build config.
// Dev server runs on 5173, which the Spring Boot backend already allows in CORS.
export default defineConfig(({ command }) => ({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      // Use src/server.ts as the server entry (our SSR error wrapper).
      server: { entry: "server" },
    }),
    // Nitro is only needed to produce a deployable server build.
    command === "build" ? nitro() : null,
    viteReact(),
    tailwindcss(),
  ],
}));
