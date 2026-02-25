// BitLaunch - Vesting Service (V2)
// On-chain contract reads and writes via OPNet SDK
// V2 changes: block-based timing, TGE basis points, beneficiary/creator indexed lookups

/* global BigInt */

import { getContract } from 'opnet';
import { opnetProvider } from './opnetProvider';
import { CONTRACTS } from './contracts';
import { VESTING_ABI } from './abis/vestingAbi';
import { resolveAddress } from './addressHelper';
import { blocksToHumanTime } from './blockTime';
import { approveAndWait } from './approveHelper';

/**
 * Get a typed contract instance for the vesting contract.
 */
async function getVestingContract(senderAddress) {
    const provider = opnetProvider.getProvider();
    const network = opnetProvider.getNetwork();
    const vestingAddress = await resolveAddress(CONTRACTS.vesting, true);
    if (senderAddress) {
        const sender = await resolveAddress(senderAddress, false);
        return getContract(vestingAddress, VESTING_ABI, provider, network, sender);
    }
    return getContract(vestingAddress, VESTING_ABI, provider, network);
}

export const vestingService = {
    // ── On-chain write operations ──

    /**
     * Create a new vesting schedule (V2 — block-based + TGE).
     *
     * @param {Object} data
     * @param {string} data.beneficiary - beneficiary address
     * @param {string} data.tokenAddress - OP20 token address
     * @param {string} data.totalAmount - raw token amount
     * @param {number|string} data.cliffBlocks - cliff duration in blocks
     * @param {number|string} data.vestingBlocks - total vesting duration in blocks
     * @param {number|string} data.startBlock - start block number
     * @param {number|string} data.tgeBps - TGE unlock percentage (basis points, 100 = 1%)
     * @param {string} data.creator - creator wallet address
     */
    async createSchedule(data, onProgress) {
        if (!data.beneficiary) throw new Error('Beneficiary address required');
        if (!data.tokenAddress) throw new Error('Token address required');
        if (!data.totalAmount || parseFloat(data.totalAmount) <= 0) {
            throw new Error('Amount must be > 0');
        }
        if (!data.vestingBlocks || parseFloat(data.vestingBlocks) <= 0) {
            throw new Error('Vesting duration must be > 0');
        }
        if (!data.creator) throw new Error('Wallet address required');

        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();

        const beneficiary = await resolveAddress(data.beneficiary, false);
        const tokenAddr = await resolveAddress(data.tokenAddress, true);
        const totalAmount = BigInt(data.totalAmount);
        const cliffBlocks = BigInt(data.cliffBlocks || '0');
        const vestingBlocks = BigInt(data.vestingBlocks);
        const startBlock = BigInt(data.startBlock || '0');
        const tgeBps = BigInt(data.tgeBps || '0');

        const creatorAddr = await resolveAddress(data.creator, false);
        const vestingContractAddr = await resolveAddress(CONTRACTS.vesting, true);

        // Step 1: Approve + wait for on-chain confirmation
        await approveAndWait({
            tokenAddr, owner: creatorAddr, spender: vestingContractAddr,
            amount: totalAmount, refundTo: data.creator,
            provider, network, onProgress,
        });

        // Step 2: Create the vesting schedule (V2: 7 params)
        onProgress?.('Creating vesting schedule...');
        const contract = await getVestingContract(data.creator);

        const simulation = await contract.createSchedule(
            beneficiary, tokenAddr, totalAmount,
            cliffBlocks, vestingBlocks, startBlock, tgeBps
        );
        if (simulation.revert) {
            throw new Error(`Create schedule failed: ${simulation.revert}`);
        }

        onProgress?.('Confirming vesting schedule — please confirm in wallet...');
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: data.creator, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        const scheduleId = simulation.properties?.scheduleId?.toString() || '0';

        return {
            success: true,
            scheduleId,
            txHash: receipt.transactionId,
        };
    },

    /**
     * Claim vested tokens on-chain. Only beneficiary can call.
     */
    async claimTokens(scheduleId, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getVestingContract(callerAddress);
        const network = opnetProvider.getNetwork();
        const id = BigInt(scheduleId);

        const simulation = await contract.claim(id);
        if (simulation.revert) {
            throw new Error(`Claim failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            claimed: simulation.properties?.claimable?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    /**
     * Revoke a vesting schedule (creator only). Returns unvested to creator.
     */
    async revokeSchedule(scheduleId, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getVestingContract(callerAddress);
        const network = opnetProvider.getNetwork();
        const id = BigInt(scheduleId);

        const simulation = await contract.revokeSchedule(id);
        if (simulation.revert) {
            throw new Error(`Revoke failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            returnedAmount: simulation.properties?.returnedAmount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    // ── On-chain reads ──

    async getScheduleCountOnChain() {
        try {
            const contract = await getVestingContract();
            const result = await contract.getScheduleCount();
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch (err) {
            console.warn('On-chain getScheduleCount failed:', err.message);
            return 0;
        }
    },

    /**
     * V2: Read a schedule — returns block-based fields + TGE + revoked/revocable.
     */
    async getScheduleOnChain(scheduleId) {
        try {
            const contract = await getVestingContract();
            const id = BigInt(scheduleId);
            const result = await contract.getSchedule(id);
            if (result.revert) return null;

            return {
                beneficiary: result.properties.beneficiary,
                token: result.properties.token,
                creator: result.properties.creator,
                totalAmount: result.properties.totalAmount.toString(),
                claimedAmount: result.properties.claimedAmount.toString(),
                cliffBlocks: Number(result.properties.cliffBlocks),
                vestingBlocks: Number(result.properties.vestingBlocks),
                startBlock: Number(result.properties.startBlock),
                tgeBps: Number(result.properties.tgeBps),
                revoked: result.properties.revoked,
                revocable: result.properties.revocable,
            };
        } catch (err) {
            console.warn('On-chain getSchedule failed:', err.message);
            return null;
        }
    },

    async getClaimableOnChain(scheduleId) {
        try {
            const contract = await getVestingContract();
            const id = BigInt(scheduleId);
            const result = await contract.getClaimable(id);
            if (result.revert) return '0';
            return result.properties.claimable.toString();
        } catch (err) {
            console.warn('On-chain getClaimable failed:', err.message);
            return '0';
        }
    },

    /**
     * V2: Get beneficiary's schedule count (efficient indexed lookup).
     */
    async getBeneficiaryScheduleCount(beneficiaryAddress) {
        try {
            const contract = await getVestingContract();
            const addr = await resolveAddress(beneficiaryAddress, false);
            const result = await contract.getBeneficiaryScheduleCount(addr);
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch {
            return 0;
        }
    },

    /**
     * V2: Get beneficiary's schedule by index.
     */
    async getBeneficiaryScheduleByIndex(beneficiaryAddress, index) {
        try {
            const contract = await getVestingContract();
            const addr = await resolveAddress(beneficiaryAddress, false);
            const result = await contract.getBeneficiaryScheduleByIndex(addr, index);
            if (result.revert) return null;
            return Number(result.properties.scheduleId);
        } catch {
            return null;
        }
    },

    /**
     * V2: Get creator's schedule count.
     */
    async getCreatorScheduleCount(creatorAddress) {
        try {
            const contract = await getVestingContract();
            const addr = await resolveAddress(creatorAddress, false);
            const result = await contract.getCreatorScheduleCount(addr);
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch {
            return 0;
        }
    },

    /**
     * V2: Get creator's schedule by index.
     */
    async getCreatorScheduleByIndex(creatorAddress, index) {
        try {
            const contract = await getVestingContract();
            const addr = await resolveAddress(creatorAddress, false);
            const result = await contract.getCreatorScheduleByIndex(addr, index);
            if (result.revert) return null;
            return Number(result.properties.scheduleId);
        } catch {
            return null;
        }
    },

    /**
     * V2: Get all schedules for a user (as beneficiary or creator).
     * Uses efficient indexed lookups instead of scanning all schedules.
     */
    async getSchedulesForAddress(address) {
        const scheduleIds = new Set();
        const schedules = [];

        // Check as beneficiary
        const benCount = await this.getBeneficiaryScheduleCount(address);
        for (let i = 0; i < benCount; i++) {
            const id = await this.getBeneficiaryScheduleByIndex(address, i);
            if (id != null) scheduleIds.add(id);
        }

        // Check as creator
        const creatorCount = await this.getCreatorScheduleCount(address);
        for (let i = 0; i < creatorCount; i++) {
            const id = await this.getCreatorScheduleByIndex(address, i);
            if (id != null) scheduleIds.add(id);
        }

        // Fetch each unique schedule
        for (const id of scheduleIds) {
            const schedule = await this.getScheduleOnChain(id);
            if (schedule) {
                schedules.push({ ...schedule, id: id.toString() });
            }
        }

        return schedules;
    },

    /**
     * Get all schedules from on-chain (full scan fallback)
     */
    async getAllSchedules() {
        try {
            const count = await this.getScheduleCountOnChain();
            const schedules = [];
            for (let i = 0; i < count; i++) {
                const schedule = await this.getScheduleOnChain(i);
                if (schedule) {
                    schedules.push({ ...schedule, id: i.toString() });
                }
            }
            return schedules;
        } catch (err) {
            console.warn('getAllSchedules failed:', err.message);
            return [];
        }
    },

    async getScheduleById(id) {
        const schedule = await this.getScheduleOnChain(id);
        if (schedule) return { ...schedule, id: id.toString() };
        return null;
    },

    // ── V2 Helpers (block-based) ──

    /**
     * V2: Compute claimable amount using block-based timing + TGE.
     */
    computeClaimable(schedule, currentBlock) {
        const total = parseFloat(schedule.totalAmount);
        const claimed = parseFloat(schedule.claimedAmount);
        const start = schedule.startBlock;
        const cliff = schedule.cliffBlocks;
        const duration = schedule.vestingBlocks;
        const tgeBps = schedule.tgeBps;

        // TGE portion (unlocked immediately at start)
        const tgeAmount = total * tgeBps / 10000;
        const vestingPool = total - tgeAmount;

        if (currentBlock < start) return 0;

        // TGE is available immediately at start
        let vested = tgeAmount;

        // Linear vesting after cliff
        if (currentBlock >= start + cliff && duration > 0) {
            const elapsedAfterStart = currentBlock - start;
            if (elapsedAfterStart >= duration) {
                vested = total; // Fully vested
            } else {
                vested += vestingPool * elapsedAfterStart / duration;
            }
        }

        return Math.max(0, vested - claimed);
    },

    /**
     * V2: Compute vesting progress as percentage.
     */
    computeProgress(schedule, currentBlock) {
        const start = schedule.startBlock;
        const duration = schedule.vestingBlocks;

        if (currentBlock < start) return 0;
        if (duration === 0) return 100;
        if (currentBlock >= start + duration) return 100;

        return Math.min(100, ((currentBlock - start) / duration) * 100);
    },

    /**
     * V2: Format block-based duration.
     */
    formatDuration(blocks) {
        return blocksToHumanTime(blocks);
    },
};
