/**
 * Debug utility to monkey-patch ZSwap deserialization and log failures
 * Import this early in main.tsx to catch ZSwap deserialization errors
 */

import { ZswapChainState } from '@midnight-ntwrk/ledger';

// Store the original deserialize method
const originalDeserialize = ZswapChainState.deserialize;

// Monkey-patch it to add logging
(ZswapChainState as any).deserialize = function(bytes: Uint8Array, networkId: any) {
  try {
    console.log('=== ZSWAP DESERIALIZATION ATTEMPT ===');
    console.log('Input bytes length:', bytes?.length);
    console.log('Network ID:', networkId);

    // Show first and last 100 bytes as hex
    if (bytes && bytes.length > 0) {
      const hexStr = Array.from(bytes.slice(0, Math.min(100, bytes.length)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      console.log('First bytes (hex):', hexStr);

      if (bytes.length > 100) {
        const lastHexStr = Array.from(bytes.slice(Math.max(0, bytes.length - 100)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        console.log('Last bytes (hex):', lastHexStr);
      }
    }

    const result = originalDeserialize.call(this, bytes, networkId);
    console.log('=== ZSWAP DESERIALIZATION SUCCESS ===');
    return result;
  } catch (error) {
    console.error('=== ZSWAP DESERIALIZATION FAILED ===');
    console.error('Error:', error);
    console.error('Input bytes length:', bytes?.length);
    console.error('Bytes is valid:', bytes instanceof Uint8Array);

    // Log the full byte array for analysis
    if (bytes && bytes.length < 10000) {
      const fullHex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      console.error('Full bytes (hex):', fullHex);
    } else if (bytes) {
      console.error('Bytes too large to log, length:', bytes.length);
    }

    console.error('===================================');
    throw error;
  }
};

console.log('ZSwap deserialization debugging enabled');
