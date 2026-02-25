// BitLaunch - Liquidity Lock Service (V2)
// On-chain contract reads and writes via OPNet SDK
// V2 changes: block-based unlock, partial unlock, lock ownership transfer, owner indexed lookups

/* global BigInt */

import { getContract, OP_20_ABI } from 'opnet';
import { opnetProvider } from './opnetProvider';
import { CONTRACTS } from './contracts';
import { LOCK_ABI } from './abis/lockAbi';
import { resolveAddress } from './addressHelper';
import { formatBlocksRemaining, blocksToHumanTime } from './blockTime';
import { approveAndWait } from './approveHelper';

/**
 * Get a typed contract instance for the liquidity lock contract.
 */
async function getLockContract(senderAddress) {
    const provider = opnetProvider.getProvider();
    const network = opnetProvider.getNetwork();
    const lockAddress = await resolveAddress(CONTRACTS.lock, true);
    if (senderAddress) {
        const sender = await resolveAddress(senderAddress, false);
        return getContract(lockAddress, LOCK_ABI, provider, network, sender);
    }
    return getContract(lockAddress, LOCK_ABI, provider, network);
}

export const liquidityLockService = {
    async fetchTokenInfo(tokenAddress) {
        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();
        const token = getContract(tokenAddress, OP_20_ABI, provider, network);

        const [nameResult, symbolResult, decimalsResult, totalSupplyResult] = await Promise.all([
            token.name(),
            token.symbol(),
            token.decimals(),
            token.totalSupply(),
        ]);

        return {
            name: nameResult.properties.name,
            symbol: symbolResult.properties.symbol,
            decimals: Number(decimalsResult.properties.decimals),
            totalSupply: totalSupplyResult.properties.totalSupply.toString(),
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
            return result.properties.balance.toString();
        } catch {
            return '0';
        }
    },

    // ── On-chain write operations ──

    /**
     * Lock LP tokens on-chain (V2 — unlockBlock instead of unlockTime).
     *
     * @param {Object} data - { tokenAddress, amount, unlockBlock, owner }
     */
    async lockTokens(data, onProgress) {
        if (!data.tokenAddress) throw new Error('Token address required');
        if (!data.amount || parseFloat(data.amount) <= 0) {
            throw new Error('Amount must be > 0');
        }
        if (!data.unlockBlock || data.unlockBlock <= 0) {
            throw new Error('Unlock block must be specified');
        }
        if (!data.owner) throw new Error('Wallet address required');

        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();

        const tokenAddr = await resolveAddress(data.tokenAddress, true);
        const amount = BigInt(data.amount);
        const unlockBlock = BigInt(data.unlockBlock);

        const ownerAddr = await resolveAddress(data.owner, false);
        const lockContractAddr = await resolveAddress(CONTRACTS.lock, true);

        // Step 1: Approve + wait for on-chain confirmation
        await approveAndWait({
            tokenAddr, owner: ownerAddr, spender: lockContractAddr,
            amount, refundTo: data.owner,
            provider, network, onProgress,
        });

        // Step 2: Lock tokens (V2: unlockBlock)
        onProgress?.('Locking tokens...');
        const contract = await getLockContract(data.owner);

        const simulation = await contract.lockTokens(tokenAddr, amount, unlockBlock);
        if (simulation.revert) {
            throw new Error(`Lock failed: ${simulation.revert}`);
        }

        onProgress?.('Confirming lock — please confirm in wallet...');
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: data.owner, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        const lockId = simulation.properties?.lockId?.toString() || '0';

        return { success: true, lockId, txHash: receipt.transactionId };
    },

    /**
     * Withdraw all tokens after unlock block.
     */
    async unlockTokens(lockId, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getLockContract(callerAddress);
        const network = opnetProvider.getNetwork();
        const id = BigInt(lockId);

        const simulation = await contract.unlock(id);
        if (simulation.revert) {
            throw new Error(`Unlock failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            amount: simulation.properties?.amount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    /**
     * V2: Partial unlock — withdraw some tokens after unlock block.
     */
    async partialUnlock(lockId, amount, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getLockContract(callerAddress);
        const network = opnetProvider.getNetwork();
        const id = BigInt(lockId);
        const amt = BigInt(amount);

        const simulation = await contract.partialUnlock(id, amt);
        if (simulation.revert) {
            throw new Error(`Partial unlock failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            remaining: simulation.properties?.remaining?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    /**
     * Extend lock duration — V2: newUnlockBlock.
     */
    async extendLock(lockId, newUnlockBlock, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getLockContract(callerAddress);
        const network = opnetProvider.getNetwork();
        const id = BigInt(lockId);
        const newBlock = BigInt(newUnlockBlock);

        const simulation = await contract.extendLock(id, newBlock);
        if (simulation.revert) {
            throw new Error(`Extend failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return { success: true, txHash: receipt.transactionId };
    },

    /**
     * V2: Transfer lock ownership to a new address.
     */
    async transferLockOwnership(lockId, newOwner, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');
        if (!newOwner) throw new Error('New owner address required');

        const contract = await getLockContract(callerAddress);
        const network = opnetProvider.getNetwork();
        const id = BigInt(lockId);
        const newOwnerAddr = await resolveAddress(newOwner, false);

        const simulation = await contract.transferLockOwnership(id, newOwnerAddr);
        if (simulation.revert) {
            throw new Error(`Transfer ownership failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return { success: true, txHash: receipt.transactionId };
    },

    // ── On-chain reads ──

    async getLockCountOnChain() {
        try {
            const contract = await getLockContract();
            const result = await contract.getLockCount();
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch (err) {
            console.warn('On-chain getLockCount failed:', err.message);
            return 0;
        }
    },

    /**
     * V2: Read a lock — withdrawn is now UINT256 (amount), unlockTime → unlockBlock.
     */
    async getLockOnChain(lockId) {
        try {
            const contract = await getLockContract();
            const id = BigInt(lockId);
            const result = await contract.getLock(id);
            if (result.revert) return null;

            return {
                owner: result.properties.owner,
                token: result.properties.token,
                amount: result.properties.amount.toString(),
                unlockBlock: Number(result.properties.unlockBlock),
                withdrawn: result.properties.withdrawn.toString(),
            };
        } catch (err) {
            console.warn('On-chain getLock failed:', err.message);
            return null;
        }
    },

    /**
     * V2: Get owner's lock count (efficient indexed lookup).
     */
    async getOwnerLockCount(ownerAddress) {
        try {
            const contract = await getLockContract();
            const owner = await resolveAddress(ownerAddress, false);
            const result = await contract.getOwnerLockCount(owner);
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch {
            return 0;
        }
    },

    /**
     * V2: Get owner's lock by index.
     */
    async getOwnerLockByIndex(ownerAddress, index) {
        try {
            const contract = await getLockContract();
            const owner = await resolveAddress(ownerAddress, false);
            const result = await contract.getOwnerLockByIndex(owner, index);
            if (result.revert) return null;
            return Number(result.properties.lockId);
        } catch {
            return null;
        }
    },

    /**
     * V2: Get locks for a specific owner using efficient indexed lookups.
     */
    async getLocksForOwner(ownerAddress) {
        try {
            const count = await this.getOwnerLockCount(ownerAddress);
            const locks = [];
            for (let i = 0; i < count; i++) {
                const lockId = await this.getOwnerLockByIndex(ownerAddress, i);
                if (lockId != null) {
                    const lock = await this.getLockOnChain(lockId);
                    if (lock) {
                        locks.push({ ...lock, id: lockId.toString() });
                    }
                }
            }
            return locks;
        } catch (err) {
            console.warn('getLocksForOwner failed:', err.message);
            return [];
        }
    },

    /**
     * Get all locks from on-chain (full scan fallback)
     */
    async getAllLocks() {
        try {
            const count = await this.getLockCountOnChain();
            const locks = [];
            for (let i = 0; i < count; i++) {
                const lock = await this.getLockOnChain(i);
                if (lock) {
                    locks.push({ ...lock, id: i.toString() });
                }
            }
            return locks;
        } catch (err) {
            console.warn('getAllLocks failed:', err.message);
            return [];
        }
    },

    async getLockById(id) {
        const lock = await this.getLockOnChain(id);
        if (lock) return { ...lock, id: id.toString() };
        return null;
    },

    async isUnlockableOnChain(lockId) {
        try {
            const contract = await getLockContract();
            const id = BigInt(lockId);
            const result = await contract.isUnlockable(id);
            if (result.revert) return false;
            return result.properties.unlockable;
        } catch {
            return false;
        }
    },

    async getTotalFeesOnChain() {
        try {
            const contract = await getLockContract();
            const result = await contract.getTotalFees();
            if (result.revert) return '0';
            return result.properties.totalFees.toString();
        } catch {
            return '0';
        }
    },

    /**
     * V2: Get platform fee in basis points.
     */
    async getPlatformFeeBps() {
        try {
            const contract = await getLockContract();
            const result = await contract.getPlatformFeeBps();
            if (result.revert) return 0;
            return Number(result.properties.feeBps);
        } catch {
            return 0;
        }
    },

    // ── Status helpers (V2: block-based) ──

    /**
     * V2: Check if lock is unlockable based on current block.
     */
    isUnlockable(lock, currentBlock) {
        const remaining = BigInt(lock.amount) - BigInt(lock.withdrawn);
        return currentBlock >= lock.unlockBlock && remaining > 0n;
    },

    /**
     * V2: Get remaining amount (total - withdrawn).
     */
    getRemainingAmount(lock) {
        return (BigInt(lock.amount) - BigInt(lock.withdrawn)).toString();
    },

    /**
     * V2: Format time remaining using blocks.
     */
    getTimeRemaining(lock, currentBlock) {
        return formatBlocksRemaining(currentBlock, lock.unlockBlock);
    },

    /**
     * V2: Compute lock status using block number.
     */
    getLockStatus(lock, currentBlock) {
        const remaining = BigInt(lock.amount) - BigInt(lock.withdrawn);
        if (remaining <= 0n) return 'withdrawn';
        if (currentBlock >= lock.unlockBlock) return 'unlockable';
        return 'locked';
    },

    async searchLocks(tokenAddress) {
        if (!tokenAddress || tokenAddress.trim() === '') return [];
        const locks = await this.getAllLocks();
        const searchLower = tokenAddress.toLowerCase();
        return locks.filter(l =>
            (l.token && l.token.toLowerCase().includes(searchLower))
        );
    },
};
