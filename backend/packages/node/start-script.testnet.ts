import type { OrchestratorConfig, ProcessConfig } from "@effectstream/orchestrator/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const batcherCwd = resolve(here, "../batcher");

// Testnet: no local Midnight services (node/indexer/proof-server).
// Only the batcher is launched locally.
const batcher: ProcessConfig = {
  name: "batcher",
  command: "bun",
  args: ["run", "start"],
  cwd: batcherCwd,
  env: {
    MIDNIGHT_NETWORK_ID: "preprod",
  },
  waitToExit: false,
  type: "system-dependency",
  link: "http://localhost:3334",
  stopProcessAtPort: [3334],
};

const config: OrchestratorConfig = {
  processes: [batcher],
};

export default config;
