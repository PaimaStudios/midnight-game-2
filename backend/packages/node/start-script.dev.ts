import type { OrchestratorConfig, ProcessConfig } from "@effectstream/orchestrator/config";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const midnightCwd = resolve(here, "../midnight");
const batcherCwd = resolve(here, "../batcher");

// Local dev: full Midnight stack (node + indexer + proof-server + contract deploy)
// followed by the batcher.
const midnight = launchMidnight(
  "@dust2dust-backend/midnight-contracts",
  { cwd: midnightCwd },
  { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
);

const batcher: ProcessConfig = {
  name: "batcher",
  command: "bun",
  args: ["run", "start"],
  cwd: batcherCwd,
  waitToExit: false,
  type: "system-dependency",
  link: "http://localhost:3334",
  stopProcessAtPort: [3334],
  dependsOn: [MidnightNames.CONTRACT_DEPLOY],
};

const config: OrchestratorConfig = {
  processes: [...midnight, batcher],
};

export default config;
