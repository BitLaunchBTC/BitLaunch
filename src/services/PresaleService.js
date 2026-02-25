// BitLaunch - Presale Service (V2)
// Interacts with individual presale contract instances (deployed by PresaleFactory).
// V2 changes: block-based timing, anti-bot, batch whitelist, contributor enumeration,
// finalized flag, platform fee BPS

/* global BigInt */

import { getContract, OP_20_ABI } from 'opnet';
import { opnetProvider } from './opnetProvider';
import { PRESALE_ABI } from './abis/presaleAbi';
import { resolveAddress } from './addressHelper';
import { formatBlocksRemaining } from './blockTime';

/**
 * Get a contract instance for a specific presale address.
 */
async function getPresaleContract(presaleAddress, senderAddress) {
    const provider = opnetProvider.getProvider();
    const network = opnetProvider.getNetwork();
    const resolved = await resolveAddress(presaleAddress, true);
    if (senderAddress) {
        const sender = await resolveAddress(senderAddress, false);
        return getContract(resolved, PRESALE_ABI, provider, network, sender);
    }
    return getContract(resolved, PRESALE_ABI, provider, network);
}

export const presaleService = {
    // ── On-chain write operations ──

    async contribute(presaleAddress, amount, senderAddress) {
        if (!presaleAddress) throw new Error('Presale address required');
        if (!senderAddress) throw new Error('Wallet address required');
        if (!amount || parseFloat(amount) <= 0) throw new Error('Amount must be > 0');

        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.contribute(BigInt(amount));
        if (simulation.revert) throw new Error(`Contribute failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return { success: true, txHash: receipt.transactionId };
    },

    async claimTokens(presaleAddress, senderAddress) {
        if (!presaleAddress) throw new Error('Presale address required');
        if (!senderAddress) throw new Error('Wallet address required');

        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.claim();
        if (simulation.revert) throw new Error(`Claim failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            tokenAmount: simulation.properties?.tokenAmount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    async finalize(presaleAddress, senderAddress) {
        if (!presaleAddress) throw new Error('Presale address required');
        if (!senderAddress) throw new Error('Wallet address required');

        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.finalize();
        if (simulation.revert) throw new Error(`Finalize failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return { success: true, txHash: receipt.transactionId };
    },

    async refund(presaleAddress, senderAddress) {
        if (!presaleAddress) throw new Error('Presale address required');
        if (!senderAddress) throw new Error('Wallet address required');

        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.refund();
        if (simulation.revert) throw new Error(`Refund failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            tokenAmount: simulation.properties?.tokenAmount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    async emergencyWithdraw(presaleAddress, senderAddress) {
        if (!presaleAddress) throw new Error('Presale address required');
        if (!senderAddress) throw new Error('Wallet address required');

        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.emergencyWithdraw();
        if (simulation.revert) throw new Error(`Emergency withdraw failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            tokenAmount: simulation.properties?.tokenAmount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    /**
     * V2: Configure vesting — cliffBlocks/durationBlocks instead of seconds.
     */
    async setVesting(presaleAddress, vestingData, senderAddress) {
        if (!presaleAddress) throw new Error('Presale address required');
        if (!senderAddress) throw new Error('Wallet address required');

        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.setVesting(
            BigInt(vestingData.cliffBlocks || '0'),
            BigInt(vestingData.durationBlocks || '0'),
            BigInt(vestingData.tgeBps || '0')
        );
        if (simulation.revert) throw new Error(`Set vesting failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return { success: true, txHash: receipt.transactionId };
    },

    /**
     * V2: Set anti-bot max contributions per block.
     */
    async setAntiBot(presaleAddress, maxPerBlock, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const simulation = await contract.setAntiBot(BigInt(maxPerBlock));
        if (simulation.revert) throw new Error(`Set anti-bot failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, txHash: receipt.transactionId };
    },

    async enableWhitelist(presaleAddress, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const simulation = await contract.enableWhitelist();
        if (simulation.revert) throw new Error(`Enable whitelist failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, txHash: receipt.transactionId };
    },

    async disableWhitelist(presaleAddress, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const simulation = await contract.disableWhitelist();
        if (simulation.revert) throw new Error(`Disable whitelist failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, txHash: receipt.transactionId };
    },

    async addToWhitelist(presaleAddress, account, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const addr = await resolveAddress(account, false);
        const simulation = await contract.addToWhitelist(addr);
        if (simulation.revert) throw new Error(`Add to whitelist failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, txHash: receipt.transactionId };
    },

    async addBatchToWhitelist(presaleAddress, batchData, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const simulation = await contract.addBatchToWhitelist(batchData);
        if (simulation.revert) throw new Error(`Batch whitelist failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, count: Number(simulation.properties?.count || 0), txHash: receipt.transactionId };
    },

    async pause(presaleAddress, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const simulation = await contract.pause();
        if (simulation.revert) throw new Error(`Pause failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, txHash: receipt.transactionId };
    },

    async unpause(presaleAddress, senderAddress) {
        const contract = await getPresaleContract(presaleAddress, senderAddress);
        const network = opnetProvider.getNetwork();
        const simulation = await contract.unpause();
        if (simulation.revert) throw new Error(`Unpause failed: ${simulation.revert}`);
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: senderAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });
        return { success: true, txHash: receipt.transactionId };
    },

    // ── On-chain reads (V2: block-based) ──

    async getPresaleInfo(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getPresaleInfo();
            if (result.revert) return null;

            return {
                token: result.properties.token?.toString() || '',
                creator: result.properties.creator?.toString() || '',
                hardCap: result.properties.hardCap?.toString() || '0',
                softCap: result.properties.softCap?.toString() || '0',
                totalRaised: result.properties.totalRaised?.toString() || '0',
                startBlock: Number(result.properties.startBlock),
                endBlock: Number(result.properties.endBlock),
            };
        } catch (err) {
            console.warn('getPresaleInfo failed:', err.message);
            return null;
        }
    },

    async getContribution(presaleAddress, contributorAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const addr = await resolveAddress(contributorAddress, false);
            const result = await contract.getContribution(addr);
            if (result.revert) return '0';
            return result.properties.contribution?.toString() || '0';
        } catch {
            return '0';
        }
    },

    async getClaimable(presaleAddress, contributorAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const addr = await resolveAddress(contributorAddress, false);
            const result = await contract.getClaimable(addr);
            if (result.revert) return '0';
            return result.properties.claimable?.toString() || '0';
        } catch {
            return '0';
        }
    },

    async getRate(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getRate();
            if (result.revert) return '0';
            return result.properties.rate?.toString() || '0';
        } catch { return '0'; }
    },

    async isActive(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.isActive();
            if (result.revert) return false;
            return result.properties.active;
        } catch { return false; }
    },

    async isSoftCapMet(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.isSoftCapMet();
            if (result.revert) return false;
            return result.properties.met;
        } catch { return false; }
    },

    async isCancelled(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.isCancelled();
            if (result.revert) return false;
            return result.properties.cancelled;
        } catch { return false; }
    },

    async isFinalized(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.isFinalized();
            if (result.revert) return false;
            return result.properties.finalized;
        } catch { return false; }
    },

    async isPaused(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.isPaused();
            if (result.revert) return false;
            return result.properties.paused;
        } catch { return false; }
    },

    async getVestingInfo(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getVestingInfo();
            if (result.revert) return { enabled: false, cliffBlocks: '0', durationBlocks: '0', tgeBps: '0' };
            return {
                enabled: result.properties.enabled,
                cliffBlocks: result.properties.cliffBlocks?.toString() || '0',
                durationBlocks: result.properties.durationBlocks?.toString() || '0',
                tgeBps: result.properties.tgeBps?.toString() || '0',
            };
        } catch {
            return { enabled: false, cliffBlocks: '0', durationBlocks: '0', tgeBps: '0' };
        }
    },

    async getPlatformFee(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getPlatformFee();
            if (result.revert) return '0';
            return result.properties.platformFee?.toString() || '0';
        } catch { return '0'; }
    },

    async getPlatformFeeBps(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getPlatformFeeBps();
            if (result.revert) return 0;
            return Number(result.properties.feeBps);
        } catch { return 0; }
    },

    async getContributorCount(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getContributorCount();
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch { return 0; }
    },

    async getContributorByIndex(presaleAddress, index) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getContributorByIndex(index);
            if (result.revert) return null;
            return {
                contributor: result.properties.contributor?.toString() || '',
                contribution: result.properties.contribution?.toString() || '0',
            };
        } catch { return null; }
    },

    async getAllContributors(presaleAddress) {
        const count = await this.getContributorCount(presaleAddress);
        const contributors = [];
        for (let i = 0; i < count; i++) {
            const info = await this.getContributorByIndex(presaleAddress, i);
            if (info) contributors.push(info);
        }
        return contributors;
    },

    async getAntiBotConfig(presaleAddress) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const result = await contract.getAntiBotConfig();
            if (result.revert) return { maxPerBlock: '0' };
            return { maxPerBlock: result.properties.maxPerBlock?.toString() || '0' };
        } catch { return { maxPerBlock: '0' }; }
    },

    async isWhitelisted(presaleAddress, account) {
        try {
            const contract = await getPresaleContract(presaleAddress);
            const addr = await resolveAddress(account, false);
            const result = await contract.isWhitelisted(addr);
            if (result.revert) return false;
            return result.properties.whitelisted;
        } catch { return false; }
    },

    // ── Token helpers ──

    async fetchTokenInfo(tokenAddress) {
        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();
        const token = getContract(tokenAddress, OP_20_ABI, provider, network);
        const [nameResult, symbolResult, decimalsResult, totalSupplyResult] = await Promise.all([
            token.name(), token.symbol(), token.decimals(), token.totalSupply(),
        ]);
        return {
            name: nameResult.properties.name,
            symbol: symbolResult.properties.symbol,
            decimals: Number(decimalsResult.properties.decimals),
            totalSupply: totalSupplyResult.properties.totalSupply?.toString() || '0',
        };
    },

    async getTokenBalance(tokenAddress, ownerAddress) {
        try {
            const provider = opnetProvider.getProvider();
            const network = opnetProvider.getNetwork();
            const owner = await resolveAddress(ownerAddress, false);
            const token = getContract(tokenAddress, OP_20_ABI, provider, network);
            const result = await token.balanceOf(owner);
            if (result.revert) return '0';
            return result.properties.balance?.toString() || '0';
        } catch { return '0'; }
    },

    // ── Status helpers (V2: block-based, needs currentBlock) ──

    getPresaleStatus(presale, currentBlock) {
        if (presale.cancelled) return 'cancelled';
        if (presale.finalized) return 'finalized';
        if (presale.paused) return 'paused';
        if (currentBlock < presale.startBlock) return 'upcoming';
        if (currentBlock > presale.endBlock) return 'ended';
        if (BigInt(presale.totalRaised) >= BigInt(presale.hardCap)) return 'filled';
        return 'live';
    },

    formatTimeRemaining(currentBlock, targetBlock) {
        return formatBlocksRemaining(currentBlock, targetBlock);
    },
};
