// BitLaunch - Airdrop Service (V2)
// Merkle claim-based airdrop pattern
// V2: Complete rewrite — replaces batch transfers with Merkle tree claims

/* global BigInt */

import { getContract, OP_20_ABI } from 'opnet';
import { opnetProvider } from './opnetProvider';
import { CONTRACTS } from './contracts';
import { AIRDROP_ABI } from './abis/airdropAbi';
import { resolveAddress } from './addressHelper';
import { approveAndWait } from './approveHelper';
import {
    buildMerkleTree,
    generateProof,
    packProof,
    hashLeaf,
    bytesToBigInt,
    serializeTreeData,
    deserializeTreeData,
    bytesToHex,
    hexToBytes,
} from './merkleTree';

const TREE_STORAGE_PREFIX = 'bitlaunch_airdrop_tree_';

/**
 * Get a typed contract instance for the airdrop contract.
 */
async function getAirdropContract(senderAddress) {
    if (!CONTRACTS.airdrop) {
        throw new Error('Airdrop contract address not configured. Set VITE_CONTRACT_AIRDROP in .env');
    }
    const provider = opnetProvider.getProvider();
    const network = opnetProvider.getNetwork();
    const airdropAddress = await resolveAddress(CONTRACTS.airdrop, true);
    if (senderAddress) {
        const sender = await resolveAddress(senderAddress, false);
        return getContract(airdropAddress, AIRDROP_ABI, provider, network, sender);
    }
    return getContract(airdropAddress, AIRDROP_ABI, provider, network);
}

export const airdropService = {
    // ── Write operations ──

    /**
     * Create a new Merkle-based airdrop.
     *
     * Steps:
     *   1. Resolve all recipient addresses to 32-byte hex
     *   2. Build Merkle tree
     *   3. Approve airdrop contract to spend tokens
     *   4. Call createAirdrop(token, totalAmount, merkleRoot, expiryBlock)
     *   5. Save tree data to localStorage for proof generation
     *
     * @param {Object} data
     * @param {string} data.tokenAddress - OP20 token address
     * @param {Array<{address: string, amount: string|bigint}>} data.recipients - [{address, amount}]
     * @param {number} data.expiryBlock - Block number when airdrop expires
     * @param {string} data.creator - Creator wallet address
     * @param {function} [data.onProgress] - Progress callback
     */
    async createAirdrop(data) {
        if (!data.tokenAddress) throw new Error('Token address required');
        if (!data.recipients || data.recipients.length === 0) throw new Error('Recipients list is empty');
        if (!data.expiryBlock) throw new Error('Expiry block required');
        if (!data.creator) throw new Error('Wallet address required');

        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();

        // Step 1: Resolve all recipient addresses to hex
        if (data.onProgress) data.onProgress('Resolving addresses...');
        const resolvedRecipients = [];
        for (const r of data.recipients) {
            const resolved = await resolveAddress(r.address, false);
            const hex = resolved.toHex ? resolved.toHex() : bytesToHex(resolved);
            resolvedRecipients.push({
                address: hex,
                amount: BigInt(r.amount),
                originalAddress: r.address,
            });
        }

        // Step 2: Build Merkle tree
        if (data.onProgress) data.onProgress('Building Merkle tree...');
        const treeData = buildMerkleTree(resolvedRecipients);
        const merkleRoot = bytesToBigInt(treeData.root);

        // Calculate total amount
        const totalAmount = resolvedRecipients.reduce((sum, r) => sum + r.amount, 0n);

        // Step 3: Approve airdrop contract + wait for on-chain confirmation
        const tokenAddr = await resolveAddress(data.tokenAddress, true);
        const creatorAddr = await resolveAddress(data.creator, false);
        const airdropAddr = await resolveAddress(CONTRACTS.airdrop, true);

        await approveAndWait({
            tokenAddr, owner: creatorAddr, spender: airdropAddr,
            amount: totalAmount, refundTo: data.creator,
            provider, network, onProgress: data.onProgress,
        });

        // Step 4: Create airdrop on-chain (allowance is now confirmed)
        if (data.onProgress) data.onProgress('Creating airdrop on-chain...');
        const contract = await getAirdropContract(data.creator);

        const simulation = await contract.createAirdrop(
            tokenAddr, totalAmount, merkleRoot, BigInt(data.expiryBlock)
        );
        if (simulation.revert) {
            throw new Error(`Create airdrop failed: ${simulation.revert}`);
        }

        if (data.onProgress) data.onProgress('Confirming airdrop — please confirm in wallet...');
        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: data.creator, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        const airdropId = simulation.properties?.airdropId?.toString() || '0';

        // Step 5: Save tree data to localStorage
        const treeJson = serializeTreeData(treeData, resolvedRecipients.map(r => ({
            address: r.address,
            amount: r.amount.toString(),
        })));
        localStorage.setItem(`${TREE_STORAGE_PREFIX}${airdropId}`, treeJson);

        return {
            success: true,
            airdropId,
            merkleRoot: bytesToHex(treeData.root),
            recipientCount: data.recipients.length,
            totalAmount: totalAmount.toString(),
            txHash: receipt.transactionId,
        };
    },

    /**
     * Claim tokens from an airdrop using a Merkle proof.
     *
     * @param {string} airdropId
     * @param {string} claimerAddress - wallet address
     * @param {string|bigint} amount - claim amount
     * @param {Uint8Array} [proofBytes] - optional pre-computed proof, otherwise loads from localStorage
     */
    async claim(airdropId, claimerAddress, amount, proofBytes) {
        if (!claimerAddress) throw new Error('Wallet address required');

        // Get proof from localStorage if not provided
        if (!proofBytes) {
            const proof = this.getProofForClaimer(airdropId, claimerAddress);
            if (!proof) {
                throw new Error('No proof found for this address. Make sure you are eligible for this airdrop.');
            }
            proofBytes = proof.proofBytes;
            amount = proof.amount;
        }

        const contract = await getAirdropContract(claimerAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.claim(
            BigInt(airdropId), BigInt(amount), proofBytes
        );
        if (simulation.revert) {
            throw new Error(`Claim failed: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: claimerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            claimedAmount: simulation.properties?.claimedAmount?.toString() || amount.toString(),
            txHash: receipt.transactionId,
        };
    },

    /**
     * Cancel an airdrop (creator only). Returns remaining tokens.
     */
    async cancelAirdrop(airdropId, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getAirdropContract(callerAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.cancelAirdrop(BigInt(airdropId));
        if (simulation.revert) throw new Error(`Cancel failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            refundedAmount: simulation.properties?.refundedAmount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    /**
     * Recover expired airdrop tokens (creator only).
     */
    async recoverExpired(airdropId, callerAddress) {
        if (!callerAddress) throw new Error('Wallet address required');

        const contract = await getAirdropContract(callerAddress);
        const network = opnetProvider.getNetwork();

        const simulation = await contract.recoverExpired(BigInt(airdropId));
        if (simulation.revert) throw new Error(`Recovery failed: ${simulation.revert}`);

        const receipt = await simulation.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: callerAddress, feeRate: 10,
            maximumAllowedSatToSpend: 50000n, network,
        });

        return {
            success: true,
            recoveredAmount: simulation.properties?.recoveredAmount?.toString() || '0',
            txHash: receipt.transactionId,
        };
    },

    // ── Read operations ──

    async getAirdrop(airdropId) {
        try {
            const contract = await getAirdropContract();
            const result = await contract.getAirdrop(BigInt(airdropId));
            if (result.revert) return null;

            return {
                creator: result.properties.creator?.toString() || '',
                token: result.properties.token?.toString() || '',
                totalAmount: result.properties.totalAmount?.toString() || '0',
                claimedAmount: result.properties.claimedAmount?.toString() || '0',
                merkleRoot: result.properties.merkleRoot?.toString() || '0',
                expiryBlock: Number(result.properties.expiryBlock),
                cancelled: result.properties.cancelled,
            };
        } catch (err) {
            console.warn('getAirdrop failed:', err.message);
            return null;
        }
    },

    async getAirdropCount() {
        try {
            const contract = await getAirdropContract();
            const result = await contract.getAirdropCount();
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch {
            return 0;
        }
    },

    async hasClaimed(airdropId, claimerAddress) {
        try {
            const contract = await getAirdropContract();
            const claimer = await resolveAddress(claimerAddress, false);
            const result = await contract.hasClaimed(BigInt(airdropId), claimer);
            if (result.revert) return false;
            return result.properties.claimed;
        } catch {
            return false;
        }
    },

    async getClaimedAmount(airdropId, claimerAddress) {
        try {
            const contract = await getAirdropContract();
            const claimer = await resolveAddress(claimerAddress, false);
            const result = await contract.getClaimedAmount(BigInt(airdropId), claimer);
            if (result.revert) return '0';
            return result.properties.claimedAmount?.toString() || '0';
        } catch {
            return '0';
        }
    },

    async getRemainingAmount(airdropId) {
        try {
            const contract = await getAirdropContract();
            const result = await contract.getRemainingAmount(BigInt(airdropId));
            if (result.revert) return '0';
            return result.properties.remaining?.toString() || '0';
        } catch {
            return '0';
        }
    },

    async isActive(airdropId) {
        try {
            const contract = await getAirdropContract();
            const result = await contract.isActive(BigInt(airdropId));
            if (result.revert) return false;
            return result.properties.active;
        } catch {
            return false;
        }
    },

    async getCreatorAirdropCount(creatorAddress) {
        try {
            const contract = await getAirdropContract();
            const creator = await resolveAddress(creatorAddress, false);
            const result = await contract.getCreatorAirdropCount(creator);
            if (result.revert) return 0;
            return Number(result.properties.count);
        } catch {
            return 0;
        }
    },

    async getCreatorAirdropByIndex(creatorAddress, index) {
        try {
            const contract = await getAirdropContract();
            const creator = await resolveAddress(creatorAddress, false);
            const result = await contract.getCreatorAirdropByIndex(creator, index);
            if (result.revert) return null;
            return Number(result.properties.airdropId);
        } catch {
            return null;
        }
    },

    /**
     * Get all airdrops created by a specific address.
     */
    async getCreatorAirdrops(creatorAddress) {
        const count = await this.getCreatorAirdropCount(creatorAddress);
        const airdrops = [];
        for (let i = 0; i < count; i++) {
            const id = await this.getCreatorAirdropByIndex(creatorAddress, i);
            if (id != null) {
                const airdrop = await this.getAirdrop(id);
                if (airdrop) airdrops.push({ ...airdrop, id: id.toString() });
            }
        }
        return airdrops;
    },

    // ── Merkle proof helpers ──

    /**
     * Get proof for a claimer from stored tree data.
     * @param {string} airdropId
     * @param {string} claimerAddress - bech32 address
     * @returns {{ proofBytes: Uint8Array, amount: string } | null}
     */
    getProofForClaimer(airdropId, claimerAddress) {
        try {
            const json = localStorage.getItem(`${TREE_STORAGE_PREFIX}${airdropId}`);
            if (!json) return null;

            const data = deserializeTreeData(json);
            if (!data.recipients || !data.leaves) return null;

            // Need to resolve bech32 to hex first — this is sync, check cache
            // For now, search by the hex address
            // The caller should resolve the address beforehand if needed
            const resolvedHex = claimerAddress; // Assume already hex if stored

            const index = data.recipients.findIndex(r =>
                r.address.toLowerCase() === resolvedHex.toLowerCase()
            );
            if (index === -1) return null;

            // Rebuild the tree to generate proof
            const treeData = buildMerkleTree(data.recipients.map(r => ({
                address: r.address,
                amount: BigInt(r.amount),
            })));

            const proof = generateProof(treeData.tree, index);
            const proofBytes = packProof(proof);

            return {
                proofBytes,
                amount: data.recipients[index].amount,
            };
        } catch (err) {
            console.warn('getProofForClaimer failed:', err.message);
            return null;
        }
    },

    /**
     * Check if tree data exists in localStorage for an airdrop.
     */
    hasTreeData(airdropId) {
        return localStorage.getItem(`${TREE_STORAGE_PREFIX}${airdropId}`) !== null;
    },

    /**
     * Get stored tree data for an airdrop.
     */
    getTreeData(airdropId) {
        try {
            const json = localStorage.getItem(`${TREE_STORAGE_PREFIX}${airdropId}`);
            if (!json) return null;
            return deserializeTreeData(json);
        } catch {
            return null;
        }
    },

    /**
     * Store tree data externally (e.g., from a shared URL).
     */
    storeTreeData(airdropId, treeJson) {
        localStorage.setItem(`${TREE_STORAGE_PREFIX}${airdropId}`, treeJson);
    },

    // ── Token helpers ──

    async fetchTokenInfo(tokenAddress) {
        const provider = opnetProvider.getProvider();
        const network = opnetProvider.getNetwork();
        const token = getContract(tokenAddress, OP_20_ABI, provider, network);

        const [nameResult, symbolResult, decimalsResult] = await Promise.all([
            token.name(),
            token.symbol(),
            token.decimals(),
        ]);

        return {
            name: nameResult.properties.name,
            symbol: symbolResult.properties.symbol,
            decimals: Number(decimalsResult.properties.decimals),
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
};
