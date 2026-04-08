import { deployMidnightContract, type DeployConfig } from "@paimaexample/midnight-contracts";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts/midnight-env";
import {
  Contract,
  createGame2PrivateState,
  type Game2PrivateState,
  witnesses,
} from "./contract-game2/src/index.ts";
import { fromFileUrl, dirname, join } from "@std/path";

const config: DeployConfig = {
  contractName: "contract-game2",
  contractFileName: "contract-game2.json",
  contractClass: Contract,
  witnesses: witnesses,
  privateStateId: "game2PrivateState",
  initialPrivateState: createGame2PrivateState(
    crypto.getRandomValues(new Uint8Array(32)),
  ) as Game2PrivateState,
  privateStateStoreName: "game2-private-state",
};

// ---------------------------------------------------------------------------
// Env → frontend file mapping
// ---------------------------------------------------------------------------

type EnvMapping = {
  envFile: string;
  addressExport: string;
};

const ENV_MAP: Record<string, EnvMapping> = {
  undeployed: {
    envFile: ".env.undeployed",
    addressExport: "UNDEPLOYED_CONTRACT_ADDRESS",
  },
  preprod: {
    envFile: ".env.preprod",
    addressExport: "PREPROD_CONTRACT_ADDRESS",
  },
  preview: {
    envFile: ".env.preview",
    addressExport: "PREVIEW_CONTRACT_ADDRESS",
  },
  mainnet: {
    envFile: ".env.mainnet",
    addressExport: "MAINNET_CONTRACT_ADDRESS",
  },
};

function getEnvMapping(networkId: string): EnvMapping {
  const mapping = ENV_MAP[networkId];
  if (!mapping) {
    throw new Error(
      `No frontend env mapping for MIDNIGHT_NETWORK_ID="${networkId}". ` +
      `Valid values: ${Object.keys(ENV_MAP).join(", ")}`,
    );
  }
  return mapping;
}

if (midnightNetworkConfig.id === "mainnet") {
  if (!Deno.env.get("MIDNIGHT_NODE_URL")) {
    throw new Error("MIDNIGHT_NODE_URL is not set");
  }
  midnightNetworkConfig.node = Deno.env.get("MIDNIGHT_NODE_URL")!;
}

// ---------------------------------------------------------------------------
// Update frontend files with the deployed contract address
// ---------------------------------------------------------------------------

async function updateFrontendEnv(contractAddress: string): Promise<void> {
  const networkId = midnightNetworkConfig.id;
  const mapping = getEnvMapping(networkId);

  const here = dirname(fromFileUrl(import.meta.url));
  const root = join(here, "../../..");

  // 1. Update the corresponding .env.* file
  const envPath = join(root, "frontend/src/phaser", mapping.envFile);
  try {
    const envContent = await Deno.readTextFile(envPath);

    if (envContent.match(/^VITE_CONTRACT_ADDRESS=/m)) {
      const updatedEnv = envContent.replace(
        /^VITE_CONTRACT_ADDRESS=.*$/m,
        `VITE_CONTRACT_ADDRESS=${contractAddress}`,
      );
      await Deno.writeTextFile(envPath, updatedEnv);
    } else {
      await Deno.writeTextFile(envPath, envContent.trimEnd() + `\nVITE_CONTRACT_ADDRESS=${contractAddress}\n`);
    }
    console.log(`Updated ${envPath} with VITE_CONTRACT_ADDRESS=${contractAddress}`);
  } catch (e) {
    console.warn(`Could not update ${envPath}: ${(e as Error).message}`);
  }

  // 2. Update contract-addresses.ts if it exists
  const addrPath = join(root, "frontend/src/phaser/src/contract-addresses.ts");
  try {
    const addrContent = await Deno.readTextFile(addrPath);
    const exportPattern = new RegExp(
      `^export const ${mapping.addressExport} = '.*';$`,
      "m",
    );
    const updatedAddr = addrContent.replace(
      exportPattern,
      `export const ${mapping.addressExport} = '${contractAddress}';`,
    );
    await Deno.writeTextFile(addrPath, updatedAddr);
    console.log(`Updated ${addrPath} with ${mapping.addressExport}=${contractAddress}`);
  } catch (e) {
    console.warn(`Could not update ${addrPath}: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// CLI: deploy or patch-frontend-env
// ---------------------------------------------------------------------------

const command = Deno.args[0];

if (command === "patch-frontend-env") {
  const { readMidnightContract } = await import("@paimaexample/midnight-contracts/read-contract");
  const data = readMidnightContract("contract-game2", {
    baseDir: dirname(fromFileUrl(import.meta.url)),
    networkId: midnightNetworkConfig.id,
  });
  if (!data.contractAddress) {
    console.error("No deployed contract address found for network:", midnightNetworkConfig.id);
    Deno.exit(1);
  }
  console.log(`Patching frontend env for network "${midnightNetworkConfig.id}" with address: ${data.contractAddress}`);
  await updateFrontendEnv(data.contractAddress);
  Deno.exit(0);
} else {
  console.log("Deploying contract with network config:", midnightNetworkConfig);

  deployMidnightContract(config, midnightNetworkConfig)
    .then(async (contractAddress) => {
      console.log("Deployment successful");
      if (contractAddress) {
        await updateFrontendEnv(contractAddress);
      }
      Deno.exit(0);
    })
    .catch((e) => {
      console.error("Unhandled error:", e);
      Deno.exit(1);
    });
}
