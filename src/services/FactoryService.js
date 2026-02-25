// BitLaunch - Factory Service (V2)
// On-chain interactions with the OP20 Factory contract
// V2 changes: multi-token per deployer, getUserTokenCount/ByIndex, transferOwnership

/* global BigInt */

import { getContract } from 'opnet';
import { opnetProvider } from './opnetProvider';
import { CONTRACTS } from './contracts';
import { FACTORY_ABI } from './abis/factoryAbi';
import { resolveAddress } from './addressHelper';
import { registerTokenFromAddress, isTokenRegistered } from './tokenRegistry';

/**
 * Get a typed contract instance for the factory contract.
 */
async function getFactoryContract(senderAddress) {
    if (!CONTRACTS.factory) {
        throw new Error('Factory contract address not configured. Deploy the factory first.');
    }
    const provider = opnetProvider.getProvider();
    const network = opnetProvider.getNetwork();
    const factoryAddress = await resolveAddress(CONTRACTS.factory, true);
    if (senderAddress) {
        const sender = await resolveAddress(senderAddress, false);
        return getContract(factoryAddress, FACTORY_ABI, provider, network, sender);
    }
    return getContract(factoryAddress, FACTORY_ABI, provider, network);
}

export const factoryService = {
    // ── Read operations ──

    async getDeployedTokensCount() {
        try {
            const contract = await getFactoryContract();
            const result = await contract.getDeploymentsCount();
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch (err) {
            console.warn('getDeploymentsCount failed:', err.message);
            return 0;
        }
    },

    async getDeploymentByIndex(index) {
        try {
            const contract = await getFactoryContract();
            const result = await contract.getDeploymentByIndex(index);
            if (result.revert) return null;
            return {
                deployer: result.properties.deployer,
                token: result.properties.token,
                block: result.properties.block,
            };
        } catch (err) {
            console.warn('getDeploymentByIndex failed:', err.message);
            return null;
        }
    },

    async getTokenOwner(tokenAddress) {
        try {
            const contract = await getFactoryContract();
            const token = await resolveAddress(tokenAddress, true);
            const result = await contract.getTokenOwner(token);
            if (result.revert) return null;
            return result.properties.owner;
        } catch (err) {
            console.warn('getTokenOwner failed:', err.message);
            return null;
        }
    },

    async getTokenDeployer(tokenAddress) {
        try {
            const contract = await getFactoryContract();
            const token = await resolveAddress(tokenAddress, true);
            const result = await contract.getTokenDeployer(token);
            if (result.revert) return null;
            return result.properties.deployer;
        } catch (err) {
            console.warn('getTokenDeployer failed:', err.message);
            return null;
        }
    },

    /**
     * V2: Get the number of tokens deployed by a specific user.
     */
    async getUserTokenCount(userAddress) {
        try {
            const contract = await getFactoryContract();
            const user = await resolveAddress(userAddress, false);
            const result = await contract.getUserTokenCount(user);
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch (err) {
            console.warn('getUserTokenCount failed:', err.message);
            return 0;
        }
    },

    /**
     * V2: Get a user's deployed token by index.
     */
    async getUserTokenByIndex(userAddress, index) {
        try {
            const contract = await getFactoryContract();
            const user = await resolveAddress(userAddress, false);
            const result = await contract.getUserTokenByIndex(user, index);
            if (result.revert) return null;
            return {
                token: result.properties.token,
                block: result.properties.block,
            };
        } catch (err) {
            console.warn('getUserTokenByIndex failed:', err.message);
            return null;
        }
    },

    /**
     * V2: Get all tokens deployed by a specific user.
     * Uses efficient indexed lookups instead of scanning all deployments.
     */
    async getUserTokens(userAddress) {
        try {
            const network = opnetProvider.getNetwork();
            const count = await this.getUserTokenCount(userAddress);
            const tokens = [];
            for (let i = 0; i < count; i++) {
                const info = await this.getUserTokenByIndex(userAddress, i);
                if (info && info.token) {
                    const addr = typeof info.token === 'string'
                        ? info.token
                        : info.token.p2op(network);
                    tokens.push({
                        address: addr,
                        block: Number(info.block),
                    });
                }
            }
            return tokens;
        } catch (err) {
            console.warn('getUserTokens failed:', err.message);
            return [];
        }
    },

    async isPaused() {
        try {
            const contract = await getFactoryContract();
            const result = await contract.isPaused();
            if (result.revert) return false;
            return result.properties.isPaused;
        } catch (err) {
            console.warn('isPaused failed:', err.message);
            return false;
        }
    },

    async getOwner() {
        try {
            const contract = await getFactoryContract();
            const result = await contract.owner();
            if (result.revert) return null;
            return result.properties.owner;
        } catch (err) {
            console.warn('getOwner failed:', err.message);
            return null;
        }
    },

    async getAllDeployedTokenAddresses() {
        try {
            const network = opnetProvider.getNetwork();
            const count = await this.getDeployedTokensCount();
            const addresses = [];
            for (let i = 0; i < count; i++) {
                const info = await this.getDeploymentByIndex(i);
                if (info && info.token) {
                    const addr = typeof info.token === 'string'
                        ? info.token
                        : info.token.p2op(network);
                    addresses.push(addr);
                }
            }
            return addresses;
        } catch (err) {
            console.warn('getAllDeployedTokenAddresses failed:', err.message);
            return [];
        }
    },

    /**
     * Sync factory-deployed tokens to the local registry.
     * V2: When deployerAddress known, uses efficient indexed lookup.
     */
    async syncTokenRegistry(deployerAddress) {
        try {
            const network = opnetProvider.getNetwork();
            let synced = 0;

            if (deployerAddress) {
                const count = await this.getUserTokenCount(deployerAddress);
                for (let i = 0; i < count; i++) {
                    const info = await this.getUserTokenByIndex(deployerAddress, i);
                    if (info && info.token && typeof info.token !== 'string') {
                        const bech32 = info.token.p2op(network);
                        if (!isTokenRegistered(bech32)) {
                            registerTokenFromAddress(info.token, network);
                            synced++;
                        }
                    }
                }
            } else {
                const count = await this.getDeployedTokensCount();
                console.log(`Syncing token registry: ${count} deployments found on-chain`);
                for (let i = 0; i < count; i++) {
                    const info = await this.getDeploymentByIndex(i);
                    if (info && info.token && typeof info.token !== 'string') {
                        const bech32 = info.token.p2op(network);
                        if (!isTokenRegistered(bech32)) {
                            registerTokenFromAddress(info.token, network);
                            synced++;
                        }
                    }
                }
            }

            console.log(`Token registry sync complete: ${synced} new tokens cached`);
            return synced;
        } catch (err) {
            console.warn('syncTokenRegistry failed:', err.message);
            return 0;
        }
    },
};
