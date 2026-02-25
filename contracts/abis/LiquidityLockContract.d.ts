import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type TokensLockedEvent = {
    readonly lockId: bigint;
    readonly owner: Address;
    readonly token: Address;
    readonly amount: bigint;
    readonly fee: bigint;
    readonly unlockBlock: bigint;
};
export type TokensUnlockedEvent = {
    readonly lockId: bigint;
    readonly owner: Address;
    readonly amount: bigint;
};
export type PartialUnlockEvent = {
    readonly lockId: bigint;
    readonly owner: Address;
    readonly amount: bigint;
    readonly remaining: bigint;
};
export type LockExtendedEvent = {
    readonly lockId: bigint;
    readonly newUnlockBlock: bigint;
};
export type LockOwnershipTransferredEvent = {
    readonly lockId: bigint;
    readonly previousOwner: Address;
    readonly newOwner: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the lockTokens function call.
 */
export type LockTokens = CallResult<
    {
        lockId: bigint;
    },
    OPNetEvent<TokensLockedEvent>[]
>;

/**
 * @description Represents the result of the unlock function call.
 */
export type Unlock = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<TokensUnlockedEvent>[]
>;

/**
 * @description Represents the result of the partialUnlock function call.
 */
export type PartialUnlock = CallResult<
    {
        remaining: bigint;
    },
    OPNetEvent<PartialUnlockEvent>[]
>;

/**
 * @description Represents the result of the extendLock function call.
 */
export type ExtendLock = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<LockExtendedEvent>[]
>;

/**
 * @description Represents the result of the transferLockOwnership function call.
 */
export type TransferLockOwnership = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<LockOwnershipTransferredEvent>[]
>;

/**
 * @description Represents the result of the setPlatformWallet function call.
 */
export type SetPlatformWallet = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setPlatformFeeBps function call.
 */
export type SetPlatformFeeBps = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getLock function call.
 */
export type GetLock = CallResult<
    {
        owner: Address;
        token: Address;
        amount: bigint;
        unlockBlock: bigint;
        withdrawn: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getLockCount function call.
 */
export type GetLockCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTotalFees function call.
 */
export type GetTotalFees = CallResult<
    {
        totalFees: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPlatformFeeBps function call.
 */
export type GetPlatformFeeBps = CallResult<
    {
        feeBps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isUnlockable function call.
 */
export type IsUnlockable = CallResult<
    {
        unlockable: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOwnerLockCount function call.
 */
export type GetOwnerLockCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOwnerLockByIndex function call.
 */
export type GetOwnerLockByIndex = CallResult<
    {
        lockId: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ILiquidityLockContract
// ------------------------------------------------------------------
export interface ILiquidityLockContract extends IOP_NETContract {
    lockTokens(token: Address, amount: bigint, unlockBlock: bigint): Promise<LockTokens>;
    unlock(lockId: bigint): Promise<Unlock>;
    partialUnlock(lockId: bigint, amount: bigint): Promise<PartialUnlock>;
    extendLock(lockId: bigint, newUnlockBlock: bigint): Promise<ExtendLock>;
    transferLockOwnership(lockId: bigint, newOwner: Address): Promise<TransferLockOwnership>;
    setPlatformWallet(newPlatformWallet: Address): Promise<SetPlatformWallet>;
    setPlatformFeeBps(feeBps: bigint): Promise<SetPlatformFeeBps>;
    getLock(lockId: bigint): Promise<GetLock>;
    getLockCount(): Promise<GetLockCount>;
    getTotalFees(): Promise<GetTotalFees>;
    getPlatformFeeBps(): Promise<GetPlatformFeeBps>;
    isUnlockable(lockId: bigint): Promise<IsUnlockable>;
    getOwnerLockCount(owner: Address): Promise<GetOwnerLockCount>;
    getOwnerLockByIndex(owner: Address, index: number): Promise<GetOwnerLockByIndex>;
}
