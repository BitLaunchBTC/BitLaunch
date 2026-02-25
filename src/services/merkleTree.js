// Merkle tree utilities for BitLaunch airdrop
// Must match the on-chain AirdropContract.ts hashing logic:
//   leaf = keccak256(claimer_32bytes || amount_32bytes_BE)
//   sorted-pair hashing at each level (OpenZeppelin pattern)

import { keccak_256 } from '@noble/hashes/sha3.js';

const HASH_SIZE = 32;

/**
 * Convert a hex string to Uint8Array.
 * @param {string} hex - Hex string with or without 0x prefix
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const padded = clean.padStart(64, '0'); // Ensure 32 bytes
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(padded.substr(i * 2, 2), 16);
    }
    return bytes;
}

/**
 * Convert Uint8Array to hex string (no 0x prefix).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Compare two 32-byte Uint8Arrays lexicographically.
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {number} negative if a < b, positive if a > b, 0 if equal
 */
function compareBytes(a, b) {
    for (let i = 0; i < HASH_SIZE; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

/**
 * Hash two nodes using sorted-pair concatenation (OpenZeppelin pattern).
 * The smaller value comes first to ensure deterministic ordering.
 * @param {Uint8Array} left - 32-byte hash
 * @param {Uint8Array} right - 32-byte hash
 * @returns {Uint8Array} 32-byte keccak256 hash
 */
function hashPair(left, right) {
    const combined = new Uint8Array(HASH_SIZE * 2);

    if (compareBytes(left, right) <= 0) {
        combined.set(left, 0);
        combined.set(right, HASH_SIZE);
    } else {
        combined.set(right, 0);
        combined.set(left, HASH_SIZE);
    }

    return keccak_256(combined);
}

/**
 * Compute a Merkle leaf hash matching the on-chain logic.
 * leaf = keccak256(address_32bytes || amount_32bytes_BE)
 *
 * @param {string} addressHex - 32-byte address as hex (from resolveAddress)
 * @param {bigint|string} amount - Token amount
 * @returns {Uint8Array} 32-byte leaf hash
 */
export function hashLeaf(addressHex, amount) {
    const addrBytes = hexToBytes(addressHex);
    const amountBytes = hexToBytes(BigInt(amount).toString(16));

    const preimage = new Uint8Array(HASH_SIZE + HASH_SIZE);
    preimage.set(addrBytes.slice(0, HASH_SIZE), 0);
    preimage.set(amountBytes.slice(0, HASH_SIZE), HASH_SIZE);

    return keccak_256(preimage);
}

/**
 * Build a Merkle tree from a list of recipients.
 *
 * @param {Array<{ address: string, amount: bigint|string }>} recipients
 *   address should be 32-byte hex (from resolveAddress / getPublicKeyInfo)
 * @returns {{ root: Uint8Array, leaves: Uint8Array[], tree: Uint8Array[][] }}
 */
export function buildMerkleTree(recipients) {
    if (!recipients || recipients.length === 0) {
        throw new Error('Recipients list cannot be empty');
    }

    // Compute leaf hashes
    const leaves = recipients.map(({ address, amount }) => hashLeaf(address, amount));

    // Build tree bottom-up
    const tree = [leaves.slice()]; // Level 0 = leaves

    let currentLevel = leaves.slice();
    while (currentLevel.length > 1) {
        const nextLevel = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            if (i + 1 < currentLevel.length) {
                nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
            } else {
                // Odd node: promote directly (hash with itself)
                nextLevel.push(hashPair(currentLevel[i], currentLevel[i]));
            }
        }

        tree.push(nextLevel);
        currentLevel = nextLevel;
    }

    return {
        root: currentLevel[0],
        leaves,
        tree,
    };
}

/**
 * Generate a Merkle proof for a specific leaf index.
 *
 * @param {Uint8Array[][]} tree - Full Merkle tree from buildMerkleTree
 * @param {number} leafIndex - Index of the leaf to prove
 * @returns {Uint8Array[]} Array of 32-byte proof elements
 */
export function generateProof(tree, leafIndex) {
    const proof = [];
    let idx = leafIndex;

    for (let level = 0; level < tree.length - 1; level++) {
        const currentLevel = tree[level];
        const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

        if (siblingIdx < currentLevel.length) {
            proof.push(currentLevel[siblingIdx]);
        } else {
            // Odd node: sibling is itself
            proof.push(currentLevel[idx]);
        }

        idx = Math.floor(idx / 2);
    }

    return proof;
}

/**
 * Verify a Merkle proof locally (same algorithm as on-chain).
 *
 * @param {Uint8Array} leaf - Leaf hash
 * @param {Uint8Array[]} proof - Proof elements
 * @param {Uint8Array} root - Expected root
 * @returns {boolean}
 */
export function verifyProof(leaf, proof, root) {
    let current = leaf;

    for (const proofElement of proof) {
        current = hashPair(current, proofElement);
    }

    return compareBytes(current, root) === 0;
}

/**
 * Pack proof elements into a single Uint8Array for on-chain submission.
 * Each element is 32 bytes, packed sequentially.
 *
 * @param {Uint8Array[]} proof
 * @returns {Uint8Array}
 */
export function packProof(proof) {
    const packed = new Uint8Array(proof.length * HASH_SIZE);
    for (let i = 0; i < proof.length; i++) {
        packed.set(proof[i], i * HASH_SIZE);
    }
    return packed;
}

/**
 * Convert a Uint8Array to a BigInt (big-endian).
 * @param {Uint8Array} bytes
 * @returns {bigint}
 */
export function bytesToBigInt(bytes) {
    return BigInt('0x' + bytesToHex(bytes));
}

/**
 * Serialize tree data for localStorage persistence.
 * @param {{ root: Uint8Array, leaves: Uint8Array[], tree: Uint8Array[][] }} treeData
 * @param {Array<{ address: string, amount: string }>} recipients
 * @returns {string} JSON string
 */
export function serializeTreeData(treeData, recipients) {
    return JSON.stringify({
        root: bytesToHex(treeData.root),
        recipients: recipients.map((r) => ({
            address: r.address,
            amount: String(r.amount),
        })),
        leaves: treeData.leaves.map(bytesToHex),
    });
}

/**
 * Deserialize tree data from localStorage.
 * @param {string} json
 * @returns {{ root: string, recipients: Array<{ address: string, amount: string }>, leaves: string[] }}
 */
export function deserializeTreeData(json) {
    return JSON.parse(json);
}

export { bytesToHex, hexToBytes };
