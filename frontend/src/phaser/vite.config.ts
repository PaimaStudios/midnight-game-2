import { defineConfig } from "vite";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  cacheDir: "./.vite",
  build: {
    target: "esnext",
    minify: false,
  },
  plugins: [
    // crypto-browserify lacks timingSafeEqual.
    //
    // - midnight-js-level-private-state-provider <= 4.0.2 imports `timingSafeEqual`
    //   directly from 'crypto', which crypto-browserify does not provide. We strip
    //   it from the import and inject an inline implementation.
    // - >= 4.0.4 already ships its own `const timingSafeEqual` (guarded by a
    //   `'timingSafeEqual' in crypto` native check that falls back to pure JS in the
    //   browser), so no patch is needed — and appending ours would collide
    //   ("Identifier 'timingSafeEqual' has already been declared"). Skip in that case.
    {
      name: 'patch-crypto-timingsafeequal',
      enforce: 'pre',
      transform(code: string, id: string) {
        if (!id.includes('@midnight-ntwrk/midnight-js-level-private-state-provider')) return;
        if (!code.includes('timingSafeEqual')) return;
        // Package already declares its own timingSafeEqual (4.0.4+) — leave it alone.
        if (/(?:const|let|var|function)\s+timingSafeEqual\b/.test(code)) return;
        const patched = code
          .replace(/,\s*timingSafeEqual(?=[,\s}])/g, '')
          .replace(/timingSafeEqual\s*,\s*/g, '');
        return {
          code: patched + '\nfunction timingSafeEqual(a, b) { if (a.length !== b.length) return false; var r = 0; for (var i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; }\n',
          map: null,
        };
      },
    },
    // Inject Buffer polyfill as an inline script that blocks until Buffer is set.
    // This ensures Buffer.from/slice/alloc are available before any pre-bundled
    // CJS module initializes (crypto-browserify chain needs it at load time).
    wasm(),
    topLevelAwait(),
    viteCommonjs(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  optimizeDeps: {
    include: ['level'],
    exclude: ['@midnight-ntwrk/midnight-js-level-private-state-provider'],
    esbuildOptions: {
      target: "esnext",
    },
  },
  define: {},
  assetsInclude: ['**/*.bin'],
  worker: {
    format: "es",
    plugins: () => [
      wasm(),
      topLevelAwait(),
    ],
    rollupOptions: {
      output: {
        chunkFileNames: "assets/worker/[name]-[hash].js",
        assetFileNames: "assets/worker/[name]-[hash][extname]",
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    watch: {
      usePolling: true
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    allowedHosts: [
      ".ngrok-free.dev",
      ".ngrok.app",
      ".ngrok.io",
    ],
  },
});
