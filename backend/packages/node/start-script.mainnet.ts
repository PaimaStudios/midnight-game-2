import type { OrchestratorConfig } from "@effectstream/orchestrator/config";

// Mainnet: no locally-launched processes (Midnight services + batcher run as
// externally-managed infrastructure). Orchestrator only supervises an empty set.
const config: OrchestratorConfig = {
  processes: [],
};

export default config;
