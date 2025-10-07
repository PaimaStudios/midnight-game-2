import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import wasm from 'vite-plugin-wasm';
import path from 'path';
import fs from 'fs';

// Plugin to copy contract artifacts as bundle assets (survives watch mode)
const copyContractArtifacts = (): Plugin => {
  return {
    name: 'copy-contract-artifacts',
    generateBundle() {
      try {
        const contractKeysPath = path.resolve('../contract/dist/managed/game2/keys');
        const contractZkirPath = path.resolve('../contract/dist/managed/game2/zkir');

        console.log('Adding contract artifacts to bundle...');

        // Helper function to recursively add files
        const addFilesToBundle = (sourceDir: string, targetDir: string) => {
          if (fs.existsSync(sourceDir)) {
            const files = fs.readdirSync(sourceDir, { recursive: true });
            files.forEach(file => {
              if (typeof file === 'string') {
                const fullPath = path.join(sourceDir, file);
                if (fs.statSync(fullPath).isFile()) {
                  this.emitFile({
                    type: 'asset',
                    fileName: `${targetDir}/${file}`,
                    source: fs.readFileSync(fullPath)
                  });
                }
              }
            });
          }
        };

        addFilesToBundle(contractKeysPath, 'keys');
        addFilesToBundle(contractZkirPath, 'zkir');

        console.log('Contract artifacts added to bundle successfully');
      } catch (error) {
        console.warn('Failed to add contract artifacts to bundle:', error instanceof Error ? error.message : String(error));
      }
    }
  };
};

// Plugin to control worker behavior based on environment
// This allows us to disable WASM workers in development while keeping them enabled in production
const injectWorkersMeta = (): Plugin => {
  return {
    name: 'inject-workers-meta',
    transformIndexHtml(html) {
      const disableWorkers = process.env.VITE_DISABLE_WORKERS === 'true';

      if (disableWorkers) {
        // Replace the default "true" with "false" to disable workers in development
        return html.replace(
          '<meta name="enable-workers" content="true" />',
          '<meta name="enable-workers" content="false" />'
        );
      }

      // Keep the default "true" value for production
      return html;
    }
  };
};

// https://github.com/vitejs/vite/blob/ec7ee22cf15bed05a6c55693ecbac27cfd615118/packages/vite/src/node/plugins/workerImportMetaUrl.ts#L127-L128
const workerImportMetaUrlRE =
  /\bnew\s+(?:Worker|SharedWorker)\s*\(\s*(new\s+URL\s*\(\s*('[^']+'|"[^"]+"|`[^`]+`)\s*,\s*import\.meta\.url\s*\))/g;

// https://vitejs.dev/config/
export default defineConfig({
  cacheDir: "./.vite",
  build: {
    target: "esnext",
    minify: false,
  },
  plugins: [
    wasm(),
    react({
      include: "**/*.tsx",
    }),
    viteCommonjs(),
    copyContractArtifacts(),
    injectWorkersMeta()
  ],
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  define: {},
  assetsInclude: ['**/*.bin'],
  worker: {
    format: "es",
    plugins: [
      {
        name: "foo",
        enforce: "pre",
        transform(code) {
          if (
            code.includes("new Worker") &&
            code.includes("new URL") &&
            code.includes("import.meta.url")
          ) {
            const result = code.replace(
              workerImportMetaUrlRE,
              `((() => { throw new Error('Nested workers are disabled') })()`
            );
            return result;
          }
        },
      },
    ],
    rollupOptions: {
      output: {
        chunkFileNames: "assets/worker/[name]-[hash].js",
        assetFileNames: "assets/worker/[name]-[hash].js",
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
});
