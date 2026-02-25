// BitLaunch Airdrop Contract
// Merkle-proof-based claim airdrop for OP20 tokens.
//
// Why claim-based?
//   OPNet has a dual-address system (P2TR + ML-DSA). Direct transfer() to bech32
//   addresses doesn't work reliably for all recipients. A claim-based Merkle
//   airdrop lets recipients prove eligibility and claim with their own wallet,
//   which guarantees the correct address type is used.
//
// Flow:
//   1. Creator builds a Merkle tree off-chain from (recipient, amount) pairs
//   2. Creator calls createAirdrop(token, totalAmount, merkleRoot, expiryBlock)
//      — transfers tokens into contract and stores the root
//   3. Recipients call claim(airdropId, amount, proof) with their Merkle proof
//      — contract verifies proof, marks as claimed, transfers tokens
//   4. After expiry, creator can recover unclaimed tokens via recoverExpired()
//   5. Creator can cancel an active airdrop via cancelAirdrop() (refunds remaining)
//
// Merkle Leaf Format:
//   leaf = keccak256(claimer_address_32bytes || amount_32bytes_BE)
//
// Proof Verification:
//   Sorted-pair hashing (same as OpenZeppelin MerkleProof). At each level:
//   if node < proofElement → hash(node || proofElement)
//   else → hash(proofElement || node)

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    AddressMemoryMap,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    NetEvent,
    Revert,
    SafeMath,
    StoredU256,
    StoredMapU256,
    TransferHelper,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { keccak256 } from '@btc-vision/btc-runtime/runtime/hashing/keccak256';
import { ReentrancyGuard, ReentrancyLevel } from '@btc-vision/btc-runtime/runtime/contracts/ReentrancyGuard';

// Hash output size (keccak256 = 32 bytes)
const HASH_SIZE: u32 = 32;

// ── Storage Pointers ──
const AIRDROP_COUNT_POINTER: u16 = Blockchain.nextPointer;
// Per-airdrop fields (key = airdropId)
const CREATOR_POINTER: u16 = Blockchain.nextPointer;
const TOKEN_POINTER: u16 = Blockchain.nextPointer;
const TOTAL_AMOUNT_POINTER: u16 = Blockchain.nextPointer;
const CLAIMED_AMOUNT_POINTER: u16 = Blockchain.nextPointer;
const MERKLE_ROOT_POINTER: u16 = Blockchain.nextPointer;
const EXPIRY_BLOCK_POINTER: u16 = Blockchain.nextPointer;
const CANCELLED_POINTER: u16 = Blockchain.nextPointer;
// Claim status: composite key hash → claimed amount (non-zero = claimed)
const CLAIM_STATUS_POINTER: u16 = Blockchain.nextPointer;
// Per-creator tracking
const CREATOR_AIRDROP_COUNT_POINTER: u16 = Blockchain.nextPointer;

// ── Events ──

@final
class AirdropCreatedEvent extends NetEvent {
    constructor(airdropId: u256, creator: Address, token: Address, totalAmount: u256, expiryBlock: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 2,
        );
        data.writeU256(airdropId);
        data.writeAddress(creator);
        data.writeAddress(token);
        data.writeU256(totalAmount);
        data.writeU256(expiryBlock);
        super('AirdropCreated', data);
    }
}

@final
class TokensClaimedEvent extends NetEvent {
    constructor(airdropId: u256, claimer: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeU256(airdropId);
        data.writeAddress(claimer);
        data.writeU256(amount);
        super('TokensClaimed', data);
    }
}

@final
class AirdropCancelledEvent extends NetEvent {
    constructor(airdropId: u256, refundedAmount: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        data.writeU256(airdropId);
        data.writeU256(refundedAmount);
        super('AirdropCancelled', data);
    }
}

@final
class AirdropExpiredRecoveredEvent extends NetEvent {
    constructor(airdropId: u256, recoveredAmount: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        data.writeU256(airdropId);
        data.writeU256(recoveredAmount);
        super('AirdropExpiredRecovered', data);
    }
}

// ── Main Contract ──

@final
export class AirdropContract extends ReentrancyGuard {
    protected override readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    // Global state
    private readonly airdropCount: StoredU256;

    // Per-airdrop storage (key = airdropId)
    private readonly creators: StoredMapU256;
    private readonly tokens: StoredMapU256;
    private readonly totalAmounts: StoredMapU256;
    private readonly claimedAmounts: StoredMapU256;
    private readonly merkleRoots: StoredMapU256;
    private readonly expiryBlocks: StoredMapU256;
    private readonly cancelled: StoredMapU256;

    // Claim tracking: key = keccak256(airdropId || claimer) → claimed amount
    private readonly claimStatus: StoredMapU256;

    // Per-creator tracking
    private readonly creatorAirdropCount: AddressMemoryMap;

    public constructor() {
        super();

        this.airdropCount = new StoredU256(AIRDROP_COUNT_POINTER, EMPTY_POINTER);
        this.creators = new StoredMapU256(CREATOR_POINTER);
        this.tokens = new StoredMapU256(TOKEN_POINTER);
        this.totalAmounts = new StoredMapU256(TOTAL_AMOUNT_POINTER);
        this.claimedAmounts = new StoredMapU256(CLAIMED_AMOUNT_POINTER);
        this.merkleRoots = new StoredMapU256(MERKLE_ROOT_POINTER);
        this.expiryBlocks = new StoredMapU256(EXPIRY_BLOCK_POINTER);
        this.cancelled = new StoredMapU256(CANCELLED_POINTER);
        this.claimStatus = new StoredMapU256(CLAIM_STATUS_POINTER);
        this.creatorAirdropCount = new AddressMemoryMap(CREATOR_AIRDROP_COUNT_POINTER);
    }

    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);
    }

    // ══════════════════════════════════════════════════════════════
    // ██ WRITE METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Create a new airdrop.
     * Creator must approve this contract to spend `totalAmount` tokens first.
     *
     * @param token - OP20 token address to airdrop
     * @param totalAmount - total tokens to deposit for all claims
     * @param merkleRoot - root of the Merkle tree (keccak256 based)
     * @param expiryBlock - block number after which unclaimed tokens can be recovered
     */
    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        { name: 'merkleRoot', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    @emit('AirdropCreated')
    public createAirdrop(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        if (token.isZero()) throw new Revert('Invalid token address');

        const totalAmount: u256 = calldata.readU256();
        if (totalAmount.isZero()) throw new Revert('Amount must be > 0');

        const merkleRoot: u256 = calldata.readU256();
        if (merkleRoot.isZero()) throw new Revert('Merkle root cannot be zero');

        const expiryBlock: u256 = calldata.readU256();
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (expiryBlock <= currentBlock) throw new Revert('Expiry block must be in future');

        const sender: Address = Blockchain.tx.sender;
        const airdropId: u256 = this.airdropCount.value;

        // Store airdrop data
        this.creators.set(airdropId, this._addressToU256(sender));
        this.tokens.set(airdropId, this._addressToU256(token));
        this.totalAmounts.set(airdropId, totalAmount);
        this.claimedAmounts.set(airdropId, u256.Zero);
        this.merkleRoots.set(airdropId, merkleRoot);
        this.expiryBlocks.set(airdropId, expiryBlock);
        this.cancelled.set(airdropId, u256.Zero);

        this.airdropCount.value = SafeMath.add(airdropId, u256.One);

        // Update creator count
        const cCount: u256 = this.creatorAirdropCount.get(sender);
        this.creatorAirdropCount.set(sender, SafeMath.add(cCount, u256.One));

        // Pull tokens from creator
        TransferHelper.transferFrom(token, sender, Blockchain.contract.address, totalAmount);

        this.emitEvent(new AirdropCreatedEvent(airdropId, sender, token, totalAmount, expiryBlock));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(airdropId);
        return response;
    }

    /**
     * Claim airdrop tokens with a Merkle proof.
     * The caller proves they are entitled to `amount` tokens via the proof.
     *
     * Leaf = keccak256(claimer_address_bytes || amount_bytes_BE)
     * Proof = packed 32-byte hashes (each proof level = 32 bytes)
     *
     * @param airdropId - which airdrop to claim from
     * @param amount - amount the claimer is entitled to (part of the Merkle leaf)
     * @param proof - packed bytes of 32-byte proof elements
     */
    @method(
        { name: 'airdropId', type: ABIDataTypes.UINT256 },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'proof', type: ABIDataTypes.BYTES },
    )
    @returns({ name: 'claimedAmount', type: ABIDataTypes.UINT256 })
    @emit('TokensClaimed')
    public claim(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        const amount: u256 = calldata.readU256();
        const proofData: Uint8Array = calldata.readBytesWithLength();

        this._requireValidAirdrop(airdropId);

        // Check airdrop is active (not cancelled)
        if (!this.cancelled.get(airdropId).isZero()) throw new Revert('Airdrop cancelled');

        // Check not expired
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const expiryBlock: u256 = this.expiryBlocks.get(airdropId);
        if (currentBlock > expiryBlock) throw new Revert('Airdrop expired');

        // Check amount is valid
        if (amount.isZero()) throw new Revert('Claim amount must be > 0');

        // Check proof data is valid (must be multiples of 32 bytes)
        if (proofData.byteLength % HASH_SIZE != 0) throw new Revert('Invalid proof length');

        const sender: Address = Blockchain.tx.sender;

        // Check not already claimed
        const claimKey: u256 = this._computeClaimKey(airdropId, sender);
        if (!this.claimStatus.get(claimKey).isZero()) throw new Revert('Already claimed');

        // Verify Merkle proof
        const leafHash: u256 = this._computeLeafHash(sender, amount);
        const root: u256 = this.merkleRoots.get(airdropId);

        if (!this._verifyMerkleProof(leafHash, proofData, root)) {
            throw new Revert('Invalid Merkle proof');
        }

        // Check sufficient tokens remaining
        const totalAmount: u256 = this.totalAmounts.get(airdropId);
        const claimedSoFar: u256 = this.claimedAmounts.get(airdropId);
        const remaining: u256 = SafeMath.sub(totalAmount, claimedSoFar);
        if (amount > remaining) throw new Revert('Insufficient airdrop balance');

        // Effects first (CEI pattern)
        this.claimStatus.set(claimKey, amount);
        this.claimedAmounts.set(airdropId, SafeMath.add(claimedSoFar, amount));

        // Transfer tokens to claimer
        const token: Address = this._u256ToAddress(this.tokens.get(airdropId));
        TransferHelper.transfer(token, sender, amount);

        this.emitEvent(new TokensClaimedEvent(airdropId, sender, amount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(amount);
        return response;
    }

    /**
     * Cancel an active airdrop. Creator only.
     * Returns all remaining (unclaimed) tokens to the creator.
     * Cannot cancel after expiry — use recoverExpired() instead.
     */
    @method({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'refundedAmount', type: ABIDataTypes.UINT256 })
    @emit('AirdropCancelled')
    public cancelAirdrop(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        this._requireValidAirdrop(airdropId);

        const sender: Address = Blockchain.tx.sender;
        const creator: Address = this._u256ToAddress(this.creators.get(airdropId));

        if (!sender.equals(creator)) throw new Revert('Only creator');
        if (!this.cancelled.get(airdropId).isZero()) throw new Revert('Already cancelled');

        const totalAmount: u256 = this.totalAmounts.get(airdropId);
        const claimedSoFar: u256 = this.claimedAmounts.get(airdropId);
        const refundAmount: u256 = SafeMath.sub(totalAmount, claimedSoFar);

        // Effects first
        this.cancelled.set(airdropId, u256.One);

        // Transfer remaining tokens back to creator
        if (!refundAmount.isZero()) {
            const token: Address = this._u256ToAddress(this.tokens.get(airdropId));
            TransferHelper.transfer(token, creator, refundAmount);
        }

        this.emitEvent(new AirdropCancelledEvent(airdropId, refundAmount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(refundAmount);
        return response;
    }

    /**
     * Recover unclaimed tokens after airdrop expiry. Creator only.
     * Only works after the expiry block has passed.
     */
    @method({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'recoveredAmount', type: ABIDataTypes.UINT256 })
    @emit('AirdropExpiredRecovered')
    public recoverExpired(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        this._requireValidAirdrop(airdropId);

        const sender: Address = Blockchain.tx.sender;
        const creator: Address = this._u256ToAddress(this.creators.get(airdropId));

        if (!sender.equals(creator)) throw new Revert('Only creator');
        if (!this.cancelled.get(airdropId).isZero()) throw new Revert('Already cancelled');

        // Must be past expiry
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const expiryBlock: u256 = this.expiryBlocks.get(airdropId);
        if (currentBlock <= expiryBlock) throw new Revert('Airdrop not yet expired');

        const totalAmount: u256 = this.totalAmounts.get(airdropId);
        const claimedSoFar: u256 = this.claimedAmounts.get(airdropId);
        const recoveredAmount: u256 = SafeMath.sub(totalAmount, claimedSoFar);

        if (recoveredAmount.isZero()) throw new Revert('Nothing to recover');

        // Effects first — mark as cancelled so it can't be recovered again
        this.cancelled.set(airdropId, u256.One);

        // Transfer remaining tokens back to creator
        const token: Address = this._u256ToAddress(this.tokens.get(airdropId));
        TransferHelper.transfer(token, creator, recoveredAmount);

        this.emitEvent(new AirdropExpiredRecoveredEvent(airdropId, recoveredAmount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(recoveredAmount);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ VIEW METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Check if a specific address has claimed from an airdrop.
     */
    @method(
        { name: 'airdropId', type: ABIDataTypes.UINT256 },
        { name: 'claimer', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'claimed', type: ABIDataTypes.BOOL })
    public hasClaimed(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        const claimer: Address = calldata.readAddress();

        this._requireValidAirdrop(airdropId);

        const claimKey: u256 = this._computeClaimKey(airdropId, claimer);
        const isClaimed: bool = !this.claimStatus.get(claimKey).isZero();

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(isClaimed);
        return response;
    }

    /**
     * Get the amount a specific address claimed from an airdrop (0 if unclaimed).
     */
    @method(
        { name: 'airdropId', type: ABIDataTypes.UINT256 },
        { name: 'claimer', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'claimedAmount', type: ABIDataTypes.UINT256 })
    public getClaimedAmount(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        const claimer: Address = calldata.readAddress();

        this._requireValidAirdrop(airdropId);

        const claimKey: u256 = this._computeClaimKey(airdropId, claimer);

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.claimStatus.get(claimKey));
        return response;
    }

    /**
     * Get full airdrop details.
     */
    @method({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        { name: 'claimedAmount', type: ABIDataTypes.UINT256 },
        { name: 'merkleRoot', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        { name: 'cancelled', type: ABIDataTypes.BOOL },
    )
    public getAirdrop(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        this._requireValidAirdrop(airdropId);

        const response: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 4 + 1,
        );
        response.writeAddress(this._u256ToAddress(this.creators.get(airdropId)));
        response.writeAddress(this._u256ToAddress(this.tokens.get(airdropId)));
        response.writeU256(this.totalAmounts.get(airdropId));
        response.writeU256(this.claimedAmounts.get(airdropId));
        response.writeU256(this.merkleRoots.get(airdropId));
        response.writeU256(this.expiryBlocks.get(airdropId));
        response.writeBoolean(!this.cancelled.get(airdropId).isZero());
        return response;
    }

    /**
     * Get the total number of airdrops created.
     */
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getAirdropCount(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.airdropCount.value);
        return response;
    }

    /**
     * Get remaining (unclaimed) tokens for an airdrop.
     */
    @method({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'remaining', type: ABIDataTypes.UINT256 })
    public getRemainingAmount(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        this._requireValidAirdrop(airdropId);

        const totalAmount: u256 = this.totalAmounts.get(airdropId);
        const claimedSoFar: u256 = this.claimedAmounts.get(airdropId);
        const remaining: u256 = SafeMath.sub(totalAmount, claimedSoFar);

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(remaining);
        return response;
    }

    /**
     * Check if an airdrop is still active (not cancelled, not expired).
     */
    @method({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'active', type: ABIDataTypes.BOOL })
    public isActive(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        this._requireValidAirdrop(airdropId);

        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const isActive: bool = this.cancelled.get(airdropId).isZero()
            && currentBlock <= this.expiryBlocks.get(airdropId);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(isActive);
        return response;
    }

    // ── Creator-Indexed Lookups ──

    /**
     * Get how many airdrops a creator has made.
     */
    @method({ name: 'creator', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getCreatorAirdropCount(calldata: Calldata): BytesWriter {
        const creator: Address = calldata.readAddress();
        const count: u256 = this.creatorAirdropCount.get(creator);

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * Get a creator's airdrop by local index.
     * Iterates all airdrops, returns the Nth match for this creator.
     */
    @method(
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT32 },
    )
    @returns({ name: 'airdropId', type: ABIDataTypes.UINT256 })
    public getCreatorAirdropByIndex(calldata: Calldata): BytesWriter {
        const creator: Address = calldata.readAddress();
        const targetIndex: u32 = calldata.readU32();

        const total: u32 = this.airdropCount.value.toU32();
        let matched: u32 = 0;

        for (let i: u32 = 0; i < total; i++) {
            const aid: u256 = u256.fromU32(i);
            const creatorU256: u256 = this.creators.get(aid);
            const airdropCreator: Address = this._u256ToAddress(creatorU256);

            if (airdropCreator.equals(creator)) {
                if (matched == targetIndex) {
                    const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
                    response.writeU256(aid);
                    return response;
                }
                matched++;
            }
        }

        throw new Revert('Index out of bounds');
    }

    /**
     * Verify a Merkle proof off-chain (view method for frontend verification).
     * Returns true if the proof is valid for the given airdrop, claimer, and amount.
     */
    @method(
        { name: 'airdropId', type: ABIDataTypes.UINT256 },
        { name: 'claimer', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'proof', type: ABIDataTypes.BYTES },
    )
    @returns({ name: 'valid', type: ABIDataTypes.BOOL })
    public verifyProof(calldata: Calldata): BytesWriter {
        const airdropId: u256 = calldata.readU256();
        const claimer: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();
        const proofData: Uint8Array = calldata.readBytesWithLength();

        this._requireValidAirdrop(airdropId);

        if (proofData.byteLength % HASH_SIZE != 0) {
            const response: BytesWriter = new BytesWriter(1);
            response.writeBoolean(false);
            return response;
        }

        const leafHash: u256 = this._computeLeafHash(claimer, amount);
        const root: u256 = this.merkleRoots.get(airdropId);
        const isValid: bool = this._verifyMerkleProof(leafHash, proofData, root);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(isValid);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ MERKLE PROOF VERIFICATION
    // ══════════════════════════════════════════════════════════════

    /**
     * Compute the Merkle leaf hash for a (claimer, amount) pair.
     * leaf = keccak256(claimer_32bytes || amount_32bytes_BE)
     */
    private _computeLeafHash(claimer: Address, amount: u256): u256 {
        // Combine claimer address (32 bytes) + amount (32 bytes BE)
        const preimage: Uint8Array = new Uint8Array(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);

        // Copy claimer address bytes (32 bytes)
        const claimerBytes: Uint8Array = claimer;
        for (let i: i32 = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            preimage[i] = claimerBytes[i];
        }

        // Copy amount as big-endian bytes (32 bytes)
        const amountBytes: Uint8Array = amount.toUint8Array(true); // big-endian
        for (let i: i32 = 0; i < U256_BYTE_LENGTH; i++) {
            preimage[ADDRESS_BYTE_LENGTH + i] = amountBytes[i];
        }

        const hash: Uint8Array = keccak256(preimage);
        return u256.fromUint8ArrayBE(hash);
    }

    /**
     * Verify a Merkle proof using sorted-pair hashing.
     * At each level, the smaller hash comes first in the concatenation.
     * This matches OpenZeppelin's MerkleProof implementation.
     *
     * @param leaf - leaf hash (keccak256 of claimer+amount)
     * @param proofData - packed proof elements (each 32 bytes)
     * @param root - expected Merkle root
     * @returns true if the proof is valid
     */
    private _verifyMerkleProof(leaf: u256, proofData: Uint8Array, root: u256): bool {
        const proofCount: u32 = proofData.byteLength / HASH_SIZE;
        let currentHash: u256 = leaf;

        for (let i: u32 = 0; i < proofCount; i++) {
            // Extract proof element (32 bytes)
            const offset: u32 = i * HASH_SIZE;
            const proofElement: Uint8Array = proofData.slice(offset, offset + HASH_SIZE);
            const proofU256: u256 = u256.fromUint8ArrayBE(proofElement);

            // Sorted-pair hashing: smaller value first
            // This ensures the same result regardless of left/right position
            const currentBytes: Uint8Array = currentHash.toUint8Array(true);

            let combined: Uint8Array;
            if (currentHash < proofU256) {
                // currentHash is smaller → comes first
                combined = new Uint8Array(HASH_SIZE * 2);
                for (let j: u32 = 0; j < HASH_SIZE; j++) {
                    combined[j] = currentBytes[j];
                    combined[HASH_SIZE + j] = proofElement[j];
                }
            } else {
                // proofElement is smaller (or equal) → comes first
                combined = new Uint8Array(HASH_SIZE * 2);
                for (let j: u32 = 0; j < HASH_SIZE; j++) {
                    combined[j] = proofElement[j];
                    combined[HASH_SIZE + j] = currentBytes[j];
                }
            }

            const hashed: Uint8Array = keccak256(combined);
            currentHash = u256.fromUint8ArrayBE(hashed);
        }

        return currentHash == root;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════

    /**
     * Compute a unique storage key for (airdropId, claimer) pairs.
     * key = keccak256(airdropId_32bytes_BE || claimer_32bytes)
     */
    private _computeClaimKey(airdropId: u256, claimer: Address): u256 {
        const preimage: Uint8Array = new Uint8Array(U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH);

        // airdropId as BE bytes
        const idBytes: Uint8Array = airdropId.toUint8Array(true);
        for (let i: i32 = 0; i < U256_BYTE_LENGTH; i++) {
            preimage[i] = idBytes[i];
        }

        // claimer address bytes
        const claimerBytes: Uint8Array = claimer;
        for (let i: i32 = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            preimage[U256_BYTE_LENGTH + i] = claimerBytes[i];
        }

        const hash: Uint8Array = keccak256(preimage);
        return u256.fromUint8ArrayBE(hash);
    }

    private _requireValidAirdrop(airdropId: u256): void {
        if (airdropId >= this.airdropCount.value) throw new Revert('Invalid airdrop ID');
    }

    private _addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private _u256ToAddress(val: u256): Address {
        return changetype<Address>(val.toUint8Array(true));
    }
}
