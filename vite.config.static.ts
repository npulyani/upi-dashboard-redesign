// Static SPA build for GitHub Pages.
// This is a PARALLEL build target — it does NOT replace the existing vite.config.ts
// (which targets Cloudflare Workers via @lovable.dev/vite-tanstack-config).
//
// Key differences from the Cloudflare build:
//  - No SSR / no Cloudflare plugin
//  - Plain client-side React SPA rendered into #root
//  - Outputs to dist-static/ instead of dist/
//  - All data fetching is already 100% client-side (Supabase), so no server needed
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanStackRouterCodeSplitter } from "@tanstack/router-plugin/vite";
import { createRouterPluginContext } from "@tanstack/router-plugin/context";
import { visualizer } from "rollup-plugin-visualizer";

// The code splitter only transforms files registered in routesByFile — a map
// normally filled by the route-tree generator, which we deliberately don't run
// here (it would overwrite routeTree.gen.ts and strip the TanStack Start module
// augmentation the SSR build needs). Register the route files ourselves instead.
const routerPluginContext = createRouterPluginContext();
const routesDir = path.resolve(__dirname, "src/routes");
for (const file of fs.readdirSync(routesDir)) {
  if (!file.endsWith(".tsx") || file === "__root.tsx") continue;
  const routeId =
    "/" + file.replace(/\.tsx$/, "").replace(/\./g, "/").replace(/\/index$/, "/");
  routerPluginContext.routesByFile.set(
    path.join(routesDir, file).replace(/\\/g, "/"),
    { routeId },
  );
}

export default defineConfig({
  plugins: [
    // tanStackRouterCodeSplitter is the generator-free half of the router
    // plugin: it only rewrites route files into lazy chunks at build time.
    tanStackRouterCodeSplitter({ autoCodeSplitting: true }, routerPluginContext),
    react(),
    tailwindcss(),
    tsConfigPaths(),
    // npm run analyze → dist-static/stats.html bundle treemap
    ...(process.env.ANALYZE
      ? [visualizer({ filename: "dist-static/stats.html", gzipSize: true, brotliSize: true })]
      : []),
  ],
  // VITE_BASE_PATH=/upi-dashboard-redesign/  for github.io subdirectory
  // VITE_BASE_PATH=/                        for custom domain (default)
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    outDir: "dist-static",
    // No manualChunks: forcing recharts into a named chunk dragged shared
    // modules (incl. React) into it, making the entry import it statically.
    // With route-level code splitting, Rollup already emits recharts as a
    // shared chunk that loads only with the chart routes.
  },
});
