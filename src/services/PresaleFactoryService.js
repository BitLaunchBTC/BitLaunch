// BitLaunch - Presale Factory Service (V3)
// Deploys new presale instances via the PresaleFactory contract
// V3 changes: vesting + anti-bot baked into createPresale (2-TX flow)

/* global BigInt */

import { getContract } from 'opnet';
import { opnetProvider } from './opnetProvider';
import { CONTRACTS } from './contracts';
import { PRESALE_FACTORY_ABI } from './abis/presaleFactoryAbi';
import { resolveAddress } from './addressHelper';
import { approveAndWait } from './approveHelper';

/**
 * Get the PresaleFactory contract instance.
 */
async function getFactoryContract(senderAddress) {
    if (!CONTRACTS.presaleFactory) {
        throw new Error('PresaleFactory address not configured. Set VITE_CONTRACT_PRESALE_FACTORY in .env');
    }
    const provider = opnetProvider.getProvider();
    const network = opnetProvider.getNetwork();
    const factoryAddress = await resolveAddress(CONTRACTS.presaleFactory, true);
    if (senderAddress) {
        const sender = await resolveAddress(senderAddress, false);
        return getContract(factoryAddress, PRESALE_FACTORY_ABI, provider, network, sender);
    }
    return getContract(factoryAddress, PRESALE_FACTORY_ABI, provider, network);
}

export const presaleFactoryService = {
    /**
     * Create a new presale via the factory (V2 — block-based timing).
     *
     * Steps:
     *   1. Approve PresaleFactory to spend creator's tokens (wait for on-chain confirmation)
     *   2. Simulate factory.createPresale(...) (now allowance is confirmed)
     *   3. Send createPresale tx and return the new presale contract address
     *
     * @param {Object} data - presale parameters
     * @param {string} data.tokenAddress - OP20 token contract address
     * @param {string} data.hardCap - hard cap in satoshis
     * @param {string} data.softCap - soft cap in satoshis
     * @param {string} data.tokenRate - tokens per satoshi
     * @param {string} data.minBuy - minimum contribution in satoshis
     * @param {string} data.maxBuy - maximum contribution in satoshis
     * @param {number} data.startBlock - V2: start block number
     * @param {number} data.endBlock - V2: end block number
     * @param {string} data.tokenAmount - total tokens to deposit
     * @param {string} [data.vestingCliff] - V3: vesting cliff blocks ('0' = disabled)
     * @param {string} [data.vestingDuration] - V3: vesting duration blocks ('0' = disabled)
     * @param {string} [data.vestingTgeBps] - V3: TGE unlock in basis points ('0' = none)
     * @param {string} [data.antiBotMaxPerBlock] - V3: max contributors per block ('0' = disabled)
     * @param {string} data.creator - creator wallet address (bech32)
     * @param {function} [onProgress] - optional progress callback
     */
    async createPresale(data, onProgress) {
        if (!data.tokenAddress) throw new Error('Token address required');
        if (!data.hardCap || parseFloat(data.hardCap) <= 0) throw new Error('Hard cap must be > 0');
        if (!data.tokenRate || parseFloat(data.tokenRate) <= 0) throw new Error('Token rate must be > 0');
        if (!data.tokenAmount || parseFloat(data.tokenAmount) <= 0) throw new Error('Token amount must be > 0');
        if (!data.creator) throw new Error('Wallet address required');

        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();

        const tokenAddr = await resolveAddress(data.tokenAddress, true);

        // All contract params are u256 (integer). Wrap with Math.round() to
        // safely handle any floating-point residue from form inputs.
        const toInt = (v, fallback = '0') => BigInt(Math.round(Number(v || fallback)));

        const hardCap = toInt(data.hardCap);
        const softCap = toInt(data.softCap);
        const rate = toInt(data.tokenRate);
        const minBuy = toInt(data.minBuy, '100000');
        const maxBuy = toInt(data.maxBuy, '10000000');
        const startBlock = toInt(data.startBlock);
        const endBlock = toInt(data.endBlock);
        const tokenAmount = toInt(data.tokenAmount);

        // V3: Vesting + anti-bot params (default to 0 = disabled)
        const vestingCliff = toInt(data.vestingCliff);
        const vestingDuration = toInt(data.vestingDuration);
        const vestingTgeBps = toInt(data.vestingTgeBps);
        const antiBotMaxPerBlock = toInt(data.antiBotMaxPerBlock);

        const creatorAddr = await resolveAddress(data.creator, false);
        const factoryAddr = await resolveAddress(CONTRACTS.presaleFactory, true);

        // Step 1: Approve + wait for on-chain confirmation
        await approveAndWait({
            tokenAddr, owner: creatorAddr, spender: factoryAddr,
            amount: tokenAmount, refundTo: data.creator,
            provider, network, onProgress,
        });

        // Step 2: Simulate createPresale (allowance is now confirmed on-chain)
        onProgress?.('Creating presale contract...');
        const factory = await getFactoryContract(data.creator);

        const simulation = await factory.createPresale(
            tokenAddr, hardCap, softCap, rate,
            minBuy, maxBuy, startBlock, endBlock, tokenAmount,
            vestingCliff, vestingDuration, vestingTgeBps, antiBotMaxPerBlock,
        );
        if (simulation.revert) {
            throw new Error(`Create presale failed: ${simulation.revert}`);
        }

        // Extract presale address from PresaleDeployed event
        let presaleAddress = '';
        if (simulation.events && simulation.events.length > 0) {
            for (const event of simulation.events) {
                const eName = event.type || event.name || '';
                if (eName === 'PresaleDeployed') {
                    const addr = event.properties?.presale
                        || event.values?.presale
                        || event.properties?.presaleAddress
                        || event.values?.presaleAddress;
                    if (addr) {
                        try {
                            presaleAddress = addr.p2op ? addr.p2op(network) : addr.toString();
                        } catch { presaleAddress = addr.toString(); }
                    }
                    break;
                }
            }
        }

        // Fallback: check simulation.result
        if (!presaleAddress && simulation.result) {
            try {
                const res = simulation.result;
                if (res && typeof res === 'object' && (res.p2op || res.toHex)) {
                    presaleAddress = res.p2op ? res.p2op(network) : res.toString();
                }
            } catch { /* ignore */ }
        }

        // Step 3: Send transaction
        onProgress?.('Confirming presale creation — please confirm in wallet...');
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: data.creator, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            presaleAddress,
            txHash: receipt.transactionId || receipt.txHash || receipt.result,
        };
    },

    // ── On-chain reads ──

    async getPresaleCount() {
        try {
            const factory = await getFactoryContract();
            const result = await factory.getPresaleCount();
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch (err) {
            console.warn('getPresaleCount failed:', err.message);
            return 0;
        }
    },

    async getPresaleByIndex(index) {
        try {
            const factory = await getFactoryContract();
            const result = await factory.getPresaleByIndex(index);
            if (result.revert) return null;

            return {
                creator: result.properties.creator?.toString() || '',
                presale: result.properties.presale?.toString() || '',
                token: result.properties.token?.toString() || '',
            };
        } catch (err) {
            console.warn(`getPresaleByIndex(${index}) failed:`, err.message);
            return null;
        }
    },

    /**
     * V2: Get number of presales created by a specific address.
     */
    async getCreatorPresaleCount(creatorAddress) {
        try {
            const factory = await getFactoryContract();
            const creator = await resolveAddress(creatorAddress, false);
            const result = await factory.getCreatorPresaleCount(creator);
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch (err) {
            console.warn('getCreatorPresaleCount failed:', err.message);
            return 0;
        }
    },

    /**
     * V2: Get a specific presale by creator and index.
     */
    async getCreatorPresaleByIndex(creatorAddress, index) {
        try {
            const factory = await getFactoryContract();
            const creator = await resolveAddress(creatorAddress, false);
            const result = await factory.getCreatorPresaleByIndex(creator, index);
            if (result.revert) return null;

            return {
                presale: result.properties.presale?.toString() || '',
                token: result.properties.token?.toString() || '',
                block: Number(result.properties.block),
            };
        } catch (err) {
            console.warn('getCreatorPresaleByIndex failed:', err.message);
            return null;
        }
    },

    /**
     * V2: Get all presales created by a specific address.
     */
    async getCreatorPresales(creatorAddress) {
        const count = await this.getCreatorPresaleCount(creatorAddress);
        const presales = [];
        for (let i = 0; i < count; i++) {
            const info = await this.getCreatorPresaleByIndex(creatorAddress, i);
            if (info) presales.push(info);
        }
        return presales;
    },

    /**
     * Enumerate all deployed presales from the factory registry.
     */
    async getAllPresaleDeployments() {
        const count = await this.getPresaleCount();
        const deployments = [];

        for (let i = 0; i < count; i++) {
            const info = await this.getPresaleByIndex(i);
            if (info) {
                deployments.push({
                    index: i,
                    creator: info.creator,
                    presaleAddress: info.presale,
                    tokenAddress: info.token,
                });
            }
        }

        return deployments;
    },

    async getPresaleCreator(presaleAddress) {
        try {
            const factory = await getFactoryContract();
            const addr = await resolveAddress(presaleAddress, true);
            const result = await factory.getPresaleCreator(addr);
            if (result.revert) return '';
            return result.properties.creator?.toString() || '';
        } catch (err) {
            console.warn('getPresaleCreator failed:', err.message);
            return '';
        }
    },

    /**
     * V2: Get default fee in basis points.
     */
    async getDefaultFeeBps() {
        try {
            const factory = await getFactoryContract();
            const result = await factory.getDefaultFeeBps();
            if (result.revert) return 0;
            return Number(result.properties.feeBps);
        } catch {
            return 0;
        }
    },

    async isPaused() {
        try {
            const factory = await getFactoryContract();
            const result = await factory.isPaused();
            if (result.revert) return false;
            return result.properties.isPaused;
        } catch {
            return false;
        }
    },

    async getOwner() {
        try {
            const factory = await getFactoryContract();
            const result = await factory.owner();
            if (result.revert) return '';
            return result.properties.owner?.toString() || '';
        } catch {
            return '';
        }
    },
};
