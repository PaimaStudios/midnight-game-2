import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DeploymentData {
  contractAddress: string;
  deployedAt: string;
  playerSecretKey?: Uint8Array;
}

const CONFIG_DIR = path.join(os.homedir(), '.game2-cli');
const DEPLOYMENT_FILE = path.join(CONFIG_DIR, 'deployment.json');

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new Error(`Failed to create config directory: ${error}`);
  }
}

/**
 * Save deployment data to disk
 */
export async function saveDeploymentData(data: DeploymentData): Promise<void> {
  await ensureConfigDir();

  // Convert Uint8Array to regular array for JSON serialization
  const serializable = {
    ...data,
    playerSecretKey: data.playerSecretKey ? Array.from(data.playerSecretKey) : undefined,
  };

  try {
    await fs.writeFile(DEPLOYMENT_FILE, JSON.stringify(serializable, null, 2), { mode: 0o600 });
    console.log(`Deployment data saved to: ${DEPLOYMENT_FILE}`);
  } catch (error) {
    throw new Error(`Failed to save deployment data: ${error}`);
  }
}

/**
 * Load deployment data from disk
 */
export async function loadDeploymentData(): Promise<DeploymentData | null> {
  try {
    const content = await fs.readFile(DEPLOYMENT_FILE, 'utf-8');
    const data = JSON.parse(content);

    // Convert array back to Uint8Array
    if (data.playerSecretKey && Array.isArray(data.playerSecretKey)) {
      data.playerSecretKey = new Uint8Array(data.playerSecretKey);
    }

    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to load deployment data: ${error}`);
  }
}

/**
 * Get the contract address from saved deployment data
 */
export async function getContractAddress(): Promise<string | null> {
  const data = await loadDeploymentData();
  return data?.contractAddress ?? null;
}

/**
 * Check if deployment data exists
 */
export async function hasDeploymentData(): Promise<boolean> {
  try {
    await fs.access(DEPLOYMENT_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear deployment data
 */
export async function clearDeploymentData(): Promise<void> {
  try {
    await fs.unlink(DEPLOYMENT_FILE);
    console.log('Deployment data cleared.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Failed to clear deployment data: ${error}`);
    }
  }
}
