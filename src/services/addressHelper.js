// BitLaunch - Address Resolution Helper
// Converts bech32 addresses (opt1..., opr1..., bcrt1p...) to Address objects.
//
// Address.fromString() only works with 0x... hex — use this helper instead.
//
// For factory-cloned contracts (tokens deployed via Factory.deployToken):
//   getPublicKeyInfo() fails because the RPC doesn't index cloned contract keys.
//   PREFERRED: pass the 0x hex address — resolves instantly via Address.fromString().
//   FALLBACK: check the local token registry for a cached hex address.

import { Address } from '@btc-vision/transaction';
import { opnetProvider } from './opnetProvider';
import { resolveFromRegistry } from './tokenRegistry';

const cache = new Map();

/**
 * Resolve an address string to an Address object.
 *
 * Resolution order:
 *   1. In-memory cache (already resolved this session)
 *   2. Direct hex — if input starts with 0x, use Address.fromString() (no RPC needed)
 *   3. RPC getPublicKeyInfo (works for directly-deployed contracts and wallets)
 *   4. Token registry fallback (for factory-cloned contracts whose hex was cached)
 *
 * @param {string} input - 0x... hex OR opt1... bech32 (contract) OR bcrt1p... (wallet)
 * @param {boolean} isContract - true for contract addresses, false for wallets
 * @returns {Promise<Address>}
 */
export async function resolveAddress(input, isContract = false) {
    if (cache.has(input)) {
        return cache.get(input);
    }

    // Direct hex resolution — no RPC needed (Bob's recommended pattern).
    // For factory-cloned tokens whose bech32 isn't indexed by RPC, paste the
    // 0x hex address shown on the Token Factory deploy page instead.
    if (typeof input === 'string' && (input.startsWith('0x') || input.startsWith('0X'))) {
        try {
            const addr = Address.fromString(input);
            cache.set(input, addr);
            return addr;
        } catch (e) {
            throw new Error(`Invalid hex address: ${input}. ${e.message}`);
        }
    }

    const bech32Address = input;
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

        // Last resort: sync factory registry and retry
        try {
            const { factoryService } = await import('./FactoryService');
            await factoryService.syncTokenRegistry();
            const retryAddress = resolveFromRegistry(bech32Address);
            if (retryAddress) {
                console.log(`Resolved ${bech32Address} after factory sync`);
                cache.set(bech32Address, retryAddress);
                return retryAddress;
            }
        } catch { /* factory sync failed — will fall through to error */ }
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
