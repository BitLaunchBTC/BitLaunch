// BitLaunch - Address Resolution Helper
// Converts bech32 addresses (opt1..., opr1..., bcrt1p...) to Address objects.
//
// Address.fromString() only works with 0x... hex — use this helper instead.
//
// For factory-cloned contracts (tokens deployed via Factory.deployToken):
//   getPublicKeyInfo() fails because the RPC doesn't index cloned contract keys.
//   Fallback: check the local token registry for a cached hex address.

import { opnetProvider } from './opnetProvider';
import { resolveFromRegistry } from './tokenRegistry';

const cache = new Map();

/**
 * Resolve a bech32 address string to an Address object.
 *
 * Resolution order:
 *   1. In-memory cache (already resolved this session)
 *   2. RPC getPublicKeyInfo (works for directly-deployed contracts and wallets)
 *   3. Token registry fallback (for factory-cloned contracts whose hex was cached)
 *
 * @param {string} bech32Address - opt1... (contract) or bcrt1p... (wallet)
 * @param {boolean} isContract - true for contract addresses, false for wallets
 * @returns {Promise<Address>}
 */
export async function resolveAddress(bech32Address, isContract = false) {
    if (cache.has(bech32Address)) {
        return cache.get(bech32Address);
    }

    const provider = opnetProvider.getProvider();
    const address = await provider.getPublicKeyInfo(bech32Address, isContract);

    if (address) {
        cache.set(bech32Address, address);
        return address;
    }

    // Fallback: check token registry for factory-cloned contracts
    // getPublicKeyInfo doesn't index contracts deployed via Factory.deployToken
    if (isContract) {
        const registryAddress = resolveFromRegistry(bech32Address);
        if (registryAddress) {
            console.log(`Resolved ${bech32Address} from token registry (factory clone)`);
            cache.set(bech32Address, registryAddress);
            return registryAddress;
        }
    }

    throw new Error(
        `Could not resolve address: ${bech32Address}. ` +
        (isContract
            ? 'The contract may not be indexed yet. If this is a factory-deployed token, ' +
              'try syncing your tokens from the Token Factory page first.'
            : `Make sure the wallet exists on the current network.`)
    );
}

export function clearAddressCache() {
    cache.clear();
}
