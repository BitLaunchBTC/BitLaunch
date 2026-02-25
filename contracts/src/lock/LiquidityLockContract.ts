// BitLaunch Liquidity Lock Contract V2
// Lock any OP20 tokens for a specified block duration to build investor trust.
// Includes configurable platform fee on lock.
//
// V2 Changes:
//   - Block-based unlock (Blockchain.block.number) — fixes medianTimestamp vulnerability
//   - Partial unlock (withdraw portion after expiry)
//   - Lock ownership transfer (transfer lock to new wallet)
//   - Owner-indexed lookup (efficient dashboard queries)
//   - Generic OP20 token lock (works with any token, not just LP)

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
    StoredAddress,
    StoredU256,
    StoredMapU256,
    TransferHelper,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { ReentrancyGuard, ReentrancyLevel } from '@btc-vision/btc-runtime/runtime/contracts/ReentrancyGuard';

// Default fee: 50 basis points = 0.5%
const DEFAULT_FEE_BPS: u256 = u256.fromU32(50);
const BPS_DENOMINATOR: u256 = u256.fromU32(10000);

// ── Storage Pointers ──
const CONTRACT_OWNER_POINTER: u16 = Blockchain.nextPointer;
const PLATFORM_WALLET_POINTER: u16 = Blockchain.nextPointer;
const PLATFORM_FEE_BPS_POINTER: u16 = Blockchain.nextPointer;    // V2: configurable
const LOCK_COUNT_POINTER: u16 = Blockchain.nextPointer;
const TOTAL_FEES_POINTER: u16 = Blockchain.nextPointer;
// Per-lock fields (key = lockId)
const LOCK_OWNER_POINTER: u16 = Blockchain.nextPointer;
const LOCK_TOKEN_POINTER: u16 = Blockchain.nextPointer;
const LOCK_AMOUNT_POINTER: u16 = Blockchain.nextPointer;         // remaining locked amount
const LOCK_UNLOCK_BLOCK_POINTER: u16 = Blockchain.nextPointer;   // V2: block number
const LOCK_WITHDRAWN_POINTER: u16 = Blockchain.nextPointer;      // total withdrawn
// V2: Per-owner tracking
const OWNER_LOCK_COUNT_POINTER: u16 = Blockchain.nextPointer;

// ── Events ──

@final
class TokensLockedEvent extends NetEvent {
    constructor(lockId: u256, owner: Address, token: Address, amount: u256, fee: u256, unlockBlock: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 3,
        );
        data.writeU256(lockId);
        data.writeAddress(owner);
        data.writeAddress(token);
        data.writeU256(amount);
        data.writeU256(fee);
        data.writeU256(unlockBlock);
        super('TokensLocked', data);
    }
}

@final
class TokensUnlockedEvent extends NetEvent {
    constructor(lockId: u256, owner: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeU256(lockId);
        data.writeAddress(owner);
        data.writeU256(amount);
        super('TokensUnlocked', data);
    }
}

@final
class PartialUnlockEvent extends NetEvent {
    constructor(lockId: u256, owner: Address, amount: u256, remaining: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH * 2,
        );
        data.writeU256(lockId);
        data.writeAddress(owner);
        data.writeU256(amount);
        data.writeU256(remaining);
        super('PartialUnlock', data);
    }
}

@final
class LockExtendedEvent extends NetEvent {
    constructor(lockId: u256, newUnlockBlock: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        data.writeU256(lockId);
        data.writeU256(newUnlockBlock);
        super('LockExtended', data);
    }
}

@final
class LockOwnershipTransferredEvent extends NetEvent {
    constructor(lockId: u256, previousOwner: Address, newOwner: Address) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH * 2,
        );
        data.writeU256(lockId);
        data.writeAddress(previousOwner);
        data.writeAddress(newOwner);
        super('LockOwnershipTransferred', data);
    }
}

// ── Main Contract ──

export class LiquidityLockContract extends ReentrancyGuard {
    protected override readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    // Global config
    private readonly contractOwner: StoredAddress;
    private readonly platformWallet: StoredAddress;
    private readonly platformFeeBps: StoredU256;       // V2: configurable
    private readonly lockCount: StoredU256;
    private readonly totalFeesCollected: StoredU256;

    // Per-lock storage (key = lockId)
    private readonly lockOwners: StoredMapU256;
    private readonly lockTokenAddresses: StoredMapU256;
    private readonly lockAmounts: StoredMapU256;        // V2: remaining locked amount
    private readonly lockUnlockBlocks: StoredMapU256;   // V2: block number
    private readonly lockWithdrawn: StoredMapU256;       // V2: total withdrawn amount

    // V2: Per-owner tracking
    private readonly ownerLockCount: AddressMemoryMap;

    public constructor() {
        super();

        this.contractOwner = new StoredAddress(CONTRACT_OWNER_POINTER);
        this.platformWallet = new StoredAddress(PLATFORM_WALLET_POINTER);
        this.platformFeeBps = new StoredU256(PLATFORM_FEE_BPS_POINTER, EMPTY_POINTER);
        this.lockCount = new StoredU256(LOCK_COUNT_POINTER, EMPTY_POINTER);
        this.totalFeesCollected = new StoredU256(TOTAL_FEES_POINTER, EMPTY_POINTER);
        this.lockOwners = new StoredMapU256(LOCK_OWNER_POINTER);
        this.lockTokenAddresses = new StoredMapU256(LOCK_TOKEN_POINTER);
        this.lockAmounts = new StoredMapU256(LOCK_AMOUNT_POINTER);
        this.lockUnlockBlocks = new StoredMapU256(LOCK_UNLOCK_BLOCK_POINTER);
        this.lockWithdrawn = new StoredMapU256(LOCK_WITHDRAWN_POINTER);
        this.ownerLockCount = new AddressMemoryMap(OWNER_LOCK_COUNT_POINTER);
    }

    /**
     * Initialize on deployment.
     * Owner = tx.origin. Platform wallet set via setPlatformWallet() after deploy.
     */
    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);

        this.contractOwner.value = Blockchain.tx.origin;

        // V2: Set default fee
        this.platformFeeBps.value = DEFAULT_FEE_BPS;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ WRITE METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Lock OP20 tokens. Caller must approve this contract first.
     * V2: Block-based unlock, configurable fee.
     */
    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'lockId', type: ABIDataTypes.UINT256 })
    @emit('TokensLocked')
    public lockTokens(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        if (token.isZero()) throw new Revert('Invalid token address');

        const amount: u256 = calldata.readU256();
        if (amount.isZero()) throw new Revert('Amount must be > 0');

        // V2: Block-based unlock
        const unlockBlock: u256 = calldata.readU256();
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (unlockBlock <= currentBlock) throw new Revert('Unlock block must be in future');

        const sender: Address = Blockchain.tx.sender;
        const lockId: u256 = this.lockCount.value;

        // Calculate platform fee
        const feeBps: u256 = this.platformFeeBps.value;
        const fee: u256 = SafeMath.div(SafeMath.mul(amount, feeBps), BPS_DENOMINATOR);
        const lockedAmount: u256 = SafeMath.sub(amount, fee);

        // Store lock data (locked amount AFTER fee)
        this.lockOwners.set(lockId, this._addressToU256(sender));
        this.lockTokenAddresses.set(lockId, this._addressToU256(token));
        this.lockAmounts.set(lockId, lockedAmount);
        this.lockUnlockBlocks.set(lockId, unlockBlock);
        this.lockWithdrawn.set(lockId, u256.Zero);

        this.lockCount.value = SafeMath.add(lockId, u256.One);

        // V2: Increment owner's lock count
        const currentCount: u256 = this.ownerLockCount.get(sender);
        this.ownerLockCount.set(sender, SafeMath.add(currentCount, u256.One));

        // Pull FULL amount from sender (fee + locked)
        TransferHelper.transferFrom(token, sender, Blockchain.contract.address, amount);

        // Send fee to platform wallet
        if (!fee.isZero()) {
            const wallet: Address = this.platformWallet.value;
            if (!wallet.isZero()) {
                TransferHelper.transfer(token, wallet, fee);
            }
            this.totalFeesCollected.value = SafeMath.add(this.totalFeesCollected.value, fee);
        }

        this.emitEvent(new TokensLockedEvent(lockId, sender, token, lockedAmount, fee, unlockBlock));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(lockId);
        return response;
    }

    /**
     * Withdraw ALL remaining tokens after unlock block. Only lock owner.
     * V2: Uses block number.
     */
    @method({ name: 'lockId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    @emit('TokensUnlocked')
    public unlock(calldata: Calldata): BytesWriter {
        const lockId: u256 = calldata.readU256();
        this._requireValidLock(lockId);

        const sender: Address = Blockchain.tx.sender;
        const owner: Address = this._u256ToAddress(this.lockOwners.get(lockId));

        if (!sender.equals(owner)) throw new Revert('Only lock owner');

        const remaining: u256 = this.lockAmounts.get(lockId);
        if (remaining.isZero()) throw new Revert('Nothing to unlock');

        // V2: Block-based check
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (currentBlock < this.lockUnlockBlocks.get(lockId)) throw new Revert('Tokens still locked');

        // Effects first (CEI pattern)
        this.lockAmounts.set(lockId, u256.Zero);
        this.lockWithdrawn.set(lockId, SafeMath.add(this.lockWithdrawn.get(lockId), remaining));

        // Transfer all remaining tokens
        const token: Address = this._u256ToAddress(this.lockTokenAddresses.get(lockId));
        TransferHelper.transfer(token, owner, remaining);

        this.emitEvent(new TokensUnlockedEvent(lockId, owner, remaining));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(remaining);
        return response;
    }

    /**
     * V2: Partial unlock — withdraw a portion of locked tokens after expiry.
     * Allows gradual release instead of all-or-nothing.
     */
    @method(
        { name: 'lockId', type: ABIDataTypes.UINT256 },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'remaining', type: ABIDataTypes.UINT256 })
    @emit('PartialUnlock')
    public partialUnlock(calldata: Calldata): BytesWriter {
        const lockId: u256 = calldata.readU256();
        const withdrawAmount: u256 = calldata.readU256();

        this._requireValidLock(lockId);

        if (withdrawAmount.isZero()) throw new Revert('Amount must be > 0');

        const sender: Address = Blockchain.tx.sender;
        const owner: Address = this._u256ToAddress(this.lockOwners.get(lockId));

        if (!sender.equals(owner)) throw new Revert('Only lock owner');

        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (currentBlock < this.lockUnlockBlocks.get(lockId)) throw new Revert('Tokens still locked');

        const currentAmount: u256 = this.lockAmounts.get(lockId);
        if (withdrawAmount > currentAmount) throw new Revert('Exceeds locked amount');

        // Effects first
        const newRemaining: u256 = SafeMath.sub(currentAmount, withdrawAmount);
        this.lockAmounts.set(lockId, newRemaining);
        this.lockWithdrawn.set(lockId, SafeMath.add(this.lockWithdrawn.get(lockId), withdrawAmount));

        // Transfer
        const token: Address = this._u256ToAddress(this.lockTokenAddresses.get(lockId));
        TransferHelper.transfer(token, owner, withdrawAmount);

        this.emitEvent(new PartialUnlockEvent(lockId, owner, withdrawAmount, newRemaining));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(newRemaining);
        return response;
    }

    /**
     * Extend lock duration (can only increase, not decrease).
     * V2: Block-based.
     */
    @method(
        { name: 'lockId', type: ABIDataTypes.UINT256 },
        { name: 'newUnlockBlock', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('LockExtended')
    public extendLock(calldata: Calldata): BytesWriter {
        const lockId: u256 = calldata.readU256();
        const newUnlockBlock: u256 = calldata.readU256();

        this._requireValidLock(lockId);

        const sender: Address = Blockchain.tx.sender;
        const owner: Address = this._u256ToAddress(this.lockOwners.get(lockId));

        if (!sender.equals(owner)) throw new Revert('Only lock owner');
        if (this.lockAmounts.get(lockId).isZero()) throw new Revert('Lock is empty');

        const currentUnlockBlock: u256 = this.lockUnlockBlocks.get(lockId);
        if (newUnlockBlock <= currentUnlockBlock) throw new Revert('Can only extend');

        this.lockUnlockBlocks.set(lockId, newUnlockBlock);

        this.emitEvent(new LockExtendedEvent(lockId, newUnlockBlock));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * V2: Transfer lock ownership to another address.
     */
    @method(
        { name: 'lockId', type: ABIDataTypes.UINT256 },
        { name: 'newOwner', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('LockOwnershipTransferred')
    public transferLockOwnership(calldata: Calldata): BytesWriter {
        const lockId: u256 = calldata.readU256();
        const newOwner: Address = calldata.readAddress();

        this._requireValidLock(lockId);

        if (newOwner.isZero()) throw new Revert('Invalid new owner');

        const sender: Address = Blockchain.tx.sender;
        const currentOwner: Address = this._u256ToAddress(this.lockOwners.get(lockId));

        if (!sender.equals(currentOwner)) throw new Revert('Only lock owner');
        if (this.lockAmounts.get(lockId).isZero()) throw new Revert('Lock is empty');

        // Update owner
        this.lockOwners.set(lockId, this._addressToU256(newOwner));

        // Update owner counts
        const prevCount: u256 = this.ownerLockCount.get(currentOwner);
        if (!prevCount.isZero()) {
            this.ownerLockCount.set(currentOwner, SafeMath.sub(prevCount, u256.One));
        }
        const newCount: u256 = this.ownerLockCount.get(newOwner);
        this.ownerLockCount.set(newOwner, SafeMath.add(newCount, u256.One));

        this.emitEvent(new LockOwnershipTransferredEvent(lockId, currentOwner, newOwner));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── Admin ──

    @method({ name: 'newPlatformWallet', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setPlatformWallet(calldata: Calldata): BytesWriter {
        this._onlyContractOwner();
        const newWallet: Address = calldata.readAddress();
        if (newWallet.isZero()) throw new Revert('Invalid wallet');

        this.platformWallet.value = newWallet;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * V2: Set platform fee BPS. Contract owner only.
     */
    @method({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setPlatformFeeBps(calldata: Calldata): BytesWriter {
        this._onlyContractOwner();
        const feeBps: u256 = calldata.readU256();
        if (feeBps > u256.fromU32(500)) throw new Revert('Fee BPS exceeds maximum (500)'); // Max 5%

        this.platformFeeBps.value = feeBps;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ VIEW METHODS
    // ══════════════════════════════════════════════════════════════

    @method({ name: 'lockId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'owner', type: ABIDataTypes.ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
        { name: 'withdrawn', type: ABIDataTypes.UINT256 },
    )
    public getLock(calldata: Calldata): BytesWriter {
        const lockId: u256 = calldata.readU256();
        this._requireValidLock(lockId);

        const response: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 3,
        );
        response.writeAddress(this._u256ToAddress(this.lockOwners.get(lockId)));
        response.writeAddress(this._u256ToAddress(this.lockTokenAddresses.get(lockId)));
        response.writeU256(this.lockAmounts.get(lockId));
        response.writeU256(this.lockUnlockBlocks.get(lockId));
        response.writeU256(this.lockWithdrawn.get(lockId));
        return response;
    }

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getLockCount(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.lockCount.value);
        return response;
    }

    @method()
    @returns({ name: 'totalFees', type: ABIDataTypes.UINT256 })
    public getTotalFees(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.totalFeesCollected.value);
        return response;
    }

    @method()
    @returns({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    public getPlatformFeeBps(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.platformFeeBps.value);
        return response;
    }

    /**
     * V2: Block-based unlockable check.
     */
    @method({ name: 'lockId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'unlockable', type: ABIDataTypes.BOOL })
    public isUnlockable(calldata: Calldata): BytesWriter {
        const lockId: u256 = calldata.readU256();
        this._requireValidLock(lockId);

        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const isReady: bool = currentBlock >= this.lockUnlockBlocks.get(lockId)
            && !this.lockAmounts.get(lockId).isZero();

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(isReady);
        return response;
    }

    // ── V2: Owner-Indexed Lookups ──

    /**
     * V2: Get how many locks an owner has.
     */
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getOwnerLockCount(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const count: u256 = this.ownerLockCount.get(owner);

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * V2: Get an owner's lock by local index.
     * Iterates all locks, returns the Nth match for this owner.
     */
    @method(
        { name: 'owner', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT32 },
    )
    @returns({ name: 'lockId', type: ABIDataTypes.UINT256 })
    public getOwnerLockByIndex(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const targetIndex: u32 = calldata.readU32();

        const total: u32 = this.lockCount.value.toU32();
        let matched: u32 = 0;

        for (let i: u32 = 0; i < total; i++) {
            const lid: u256 = u256.fromU32(i);
            const lockOwnerU256: u256 = this.lockOwners.get(lid);
            const lockOwner: Address = this._u256ToAddress(lockOwnerU256);

            if (lockOwner.equals(owner)) {
                if (matched == targetIndex) {
                    const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
                    response.writeU256(lid);
                    return response;
                }
                matched++;
            }
        }

        throw new Revert('Index out of bounds');
    }

    // ══════════════════════════════════════════════════════════════
    // ██ INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════

    private _onlyContractOwner(): void {
        if (!this.contractOwner.value.equals(Blockchain.tx.sender)) {
            throw new Revert('Only contract owner');
        }
    }

    private _requireValidLock(lockId: u256): void {
        if (lockId >= this.lockCount.value) throw new Revert('Invalid lock ID');
    }

    private _addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private _u256ToAddress(val: u256): Address {
        return changetype<Address>(val.toUint8Array(true));
    }
}
