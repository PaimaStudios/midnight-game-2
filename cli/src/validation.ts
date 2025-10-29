/**
 * Validation utilities for CLI inputs
 */

/**
 * Validates a Midnight contract address format
 * Contract addresses should be hex strings of a specific length
 */
export function isValidContractAddress(address: string): boolean {
  // Midnight contract addresses are typically 64-character hex strings (possibly with a prefix)
  // This is a basic validation - adjust based on actual format requirements
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Remove any potential prefix
  const cleanAddress = address.replace(/^0x/, '');

  // Check if it's a valid hex string of reasonable length (32-128 chars is typical)
  const hexPattern = /^[0-9a-fA-F]{32,128}$/;
  return hexPattern.test(cleanAddress);
}

/**
 * Validates batcher address format (coinPublicKey|encryptionPublicKey)
 */
export function validateBatcherAddress(address: string): { coinPublicKey: string; encryptionPublicKey: string } {
  const parts = address.split('|');

  if (parts.length !== 2) {
    throw new Error(`Invalid batcher address format. Expected "coinPublicKey|encryptionPublicKey", got: ${address}`);
  }

  const [coinPublicKey, encryptionPublicKey] = parts;

  if (!coinPublicKey || !encryptionPublicKey) {
    throw new Error('Batcher address parts cannot be empty');
  }

  return { coinPublicKey, encryptionPublicKey };
}
