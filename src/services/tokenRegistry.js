// BitLaunch - Token Address Registry
// Caches bech32 → hex address mappings in localStorage.
//
// WHY: Factory-cloned contracts (tokens deployed via Factory.deployToken)
// are NOT indexed by the RPC's getPublicKeyInfo endpoint. The P2OP bech32
// address only encodes hash160(mldsaKey) — 20 bytes — but Address.fromString()
// needs the full 32-byte MLDSA hash. This registry bridges the gap by caching
// the hex address returned during deployment or enumerated from the Factory.

import { Address } from '@btc-vision/transaction';

const STORAGE_KEY = 'bitlaunch_token_registry';

/**
 * Get the registry object from localStorage.
 * @returns {Object} Map of bech32 → hex addresses
 */
function getRegistry() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

/**
 * Save a bech32 → hex mapping to the registry.
 * @param {string} bech32Address - The P2OP bech32 address (opt1sq.../opr1sq...)
 * @param {string} hexAddress - The 0x-prefixed 32-byte MLDSA hash hex
 */
export function registerToken(bech32Address, hexAddress) {
    if (!bech32Address || !hexAddress) return;

    const registry = getRegistry();
    // Normalize hex to 0x prefix
    const hex = hexAddress.startsWith('0x') ? hexAddress : `0x${hexAddress}`;
    registry[bech32Address] = hex;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

/**
 * Register a token from an Address object.
 * Extracts both bech32 and hex representations and stores the mapping.
 * @param {Address} addressObj - The Address object from ABI decoding
 * @param {Object} network - Bitcoin network config for P2OP encoding
 */
export function registerTokenFromAddress(addressObj, network) {
    if (!addressObj || !network) return;
    try {
        const bech32 = addressObj.p2op(network);
        const hex = addressObj.toHex();
        if (bech32 && hex) {
            registerToken(bech32, hex);
        }
    } catch (e) {
        console.warn('registerTokenFromAddress failed:', e.message);
    }
}

/**
 * Look up a hex address from the registry.
 * @param {string} bech32Address - The P2OP bech32 address to look up
 * @returns {string|null} The hex address or null if not found
 */
export function getTokenHex(bech32Address) {
    const registry = getRegistry();
    return registry[bech32Address] || null;
}

/**
 * Try to create an Address object from the registry.
 * @param {string} bech32Address - The P2OP bech32 address to resolve
 * @returns {Address|null} The Address object or null if not in registry
 */
export function resolveFromRegistry(bech32Address) {
    const hex = getTokenHex(bech32Address);
    if (!hex) return null;
    try {
        return Address.fromString(hex);
    } catch (e) {
        console.warn('Address.fromString failed for cached hex:', e.message);
        return null;
    }
}

/**
 * Check if a token address is in the registry.
 * @param {string} bech32Address - The P2OP bech32 address
 * @returns {boolean}
 */
export function isTokenRegistered(bech32Address) {
    const registry = getRegistry();
    return !!registry[bech32Address];
}

/**
 * Get all registered token addresses.
 * @returns {string[]} Array of bech32 addresses
 */
export function getAllRegisteredTokens() {
    const registry = getRegistry();
    return Object.keys(registry);
}

/**
 * Remove a token from the registry.
 * @param {string} bech32Address - The P2OP bech32 address
 */
export function unregisterToken(bech32Address) {
    const registry = getRegistry();
    delete registry[bech32Address];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

/**
 * Clear the entire registry.
 */
export function clearTokenRegistry() {
    localStorage.removeItem(STORAGE_KEY);
}
