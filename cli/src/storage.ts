import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DeploymentData {
  contractAddress: string;
  deployedAt: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.midnight-dust-to-dust');
const DEPLOYMENT_FILE = path.join(CONFIG_DIR, 'deployment.json');

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export async function saveDeploymentData(data: DeploymentData): Promise<string> {
  await ensureConfigDir();
  await fs.writeFile(DEPLOYMENT_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return DEPLOYMENT_FILE;
}

export async function loadDeploymentData(): Promise<DeploymentData | null> {
  try {
    const content = await fs.readFile(DEPLOYMENT_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function hasDeploymentData(): Promise<boolean> {
  try {
    await fs.access(DEPLOYMENT_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function clearDeploymentData(): Promise<void> {
  try {
    await fs.unlink(DEPLOYMENT_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
