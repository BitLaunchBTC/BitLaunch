import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type PresaleCreatedEvent = {
    readonly creator: Address;
    readonly token: Address;
    readonly hardCap: bigint;
    readonly softCap: bigint;
};
export type ContributedEvent = {
    readonly contributor: Address;
    readonly amount: bigint;
};
export type ClaimedEvent = {
    readonly claimer: Address;
    readonly tokenAmount: bigint;
};
export type FinalizedEvent = {
    readonly totalRaised: bigint;
    readonly platformFee: bigint;
};
export type RefundedEvent = {
    readonly creator: Address;
    readonly tokenAmount: bigint;
};
export type PresaleCancelledEvent = {
    readonly by: Address;
    readonly tokensReturned: bigint;
};
export type PresalePausedEvent = {
    readonly by: Address;
};
export type PresaleUnpausedEvent = {
    readonly by: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the initialize function call.
 */
export type Initialize = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<PresaleCreatedEvent>[]
>;

/**
 * @description Represents the result of the setVesting function call.
 */
export type SetVesting = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setAntiBot function call.
 */
export type SetAntiBot = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the enableWhitelist function call.
 */
export type EnableWhitelist = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the disableWhitelist function call.
 */
export type DisableWhitelist = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the addToWhitelist function call.
 */
export type AddToWhitelist = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the addBatchToWhitelist function call.
 */
export type AddBatchToWhitelist = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the removeFromWhitelist function call.
 */
export type RemoveFromWhitelist = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the contribute function call.
 */
export type Contribute = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<ContributedEvent>[]
>;

/**
 * @description Represents the result of the claim function call.
 */
export type Claim = CallResult<
    {
        tokenAmount: bigint;
    },
    OPNetEvent<ClaimedEvent>[]
>;

/**
 * @description Represents the result of the finalize function call.
 */
export type Finalize = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<FinalizedEvent>[]
>;

/**
 * @description Represents the result of the refund function call.
 */
export type Refund = CallResult<
    {
        tokenAmount: bigint;
    },
    OPNetEvent<RefundedEvent>[]
>;

/**
 * @description Represents the result of the emergencyWithdraw function call.
 */
export type EmergencyWithdraw = CallResult<
    {
        tokenAmount: bigint;
    },
    OPNetEvent<PresaleCancelledEvent>[]
>;

/**
 * @description Represents the result of the pause function call.
 */
export type Pause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<PresalePausedEvent>[]
>;

/**
 * @description Represents the result of the unpause function call.
 */
export type Unpause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<PresaleUnpausedEvent>[]
>;

/**
 * @description Represents the result of the onOP20Received function call.
 */
export type OnOP20Received = CallResult<
    {
        selector: Uint8Array;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPresaleInfo function call.
 */
export type GetPresaleInfo = CallResult<
    {
        token: Address;
        creator: Address;
        hardCap: bigint;
        softCap: bigint;
        totalRaised: bigint;
        startBlock: bigint;
        endBlock: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getContribution function call.
 */
export type GetContribution = CallResult<
    {
        contribution: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getClaimable function call.
 */
export type GetClaimable = CallResult<
    {
        claimable: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getRate function call.
 */
export type GetRate = CallResult<
    {
        rate: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPlatformFee function call.
 */
export type GetPlatformFee = CallResult<
    {
        platformFee: bigint;
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
 * @description Represents the result of the isActive function call.
 */
export type IsActive = CallResult<
    {
        active: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isSoftCapMet function call.
 */
export type IsSoftCapMet = CallResult<
    {
        met: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isWhitelisted function call.
 */
export type IsWhitelisted = CallResult<
    {
        whitelisted: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getVestingInfo function call.
 */
export type GetVestingInfo = CallResult<
    {
        enabled: boolean;
        cliffBlocks: bigint;
        durationBlocks: bigint;
        tgeBps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isPaused function call.
 */
export type IsPaused = CallResult<
    {
        paused: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isCancelled function call.
 */
export type IsCancelled = CallResult<
    {
        cancelled: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isFinalized function call.
 */
export type IsFinalized = CallResult<
    {
        finalized: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getContributorCount function call.
 */
export type GetContributorCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getContributorByIndex function call.
 */
export type GetContributorByIndex = CallResult<
    {
        contributor: Address;
        contribution: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAntiBotConfig function call.
 */
export type GetAntiBotConfig = CallResult<
    {
        maxPerBlock: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IPresaleContract
// ------------------------------------------------------------------
export interface IPresaleContract extends IOP_NETContract {
    initialize(
        creator: Address,
        platformWallet: Address,
        tokenAddr: Address,
        hardCap: bigint,
        softCap: bigint,
        rate: bigint,
        minBuy: bigint,
        maxBuy: bigint,
        startBlock: bigint,
        endBlock: bigint,
        tokenAmount: bigint,
        feeBps: bigint,
        pullTokens: boolean,
        vestingCliff: bigint,
        vestingDuration: bigint,
        vestingTgeBps: bigint,
        antiBotMaxPerBlock: bigint,
    ): Promise<Initialize>;
    setVesting(cliffBlocks: bigint, durationBlocks: bigint, tgeBps: bigint): Promise<SetVesting>;
    setAntiBot(maxPerBlock: bigint): Promise<SetAntiBot>;
    enableWhitelist(): Promise<EnableWhitelist>;
    disableWhitelist(): Promise<DisableWhitelist>;
    addToWhitelist(account: Address): Promise<AddToWhitelist>;
    addBatchToWhitelist(data: Uint8Array): Promise<AddBatchToWhitelist>;
    removeFromWhitelist(account: Address): Promise<RemoveFromWhitelist>;
    contribute(amount: bigint): Promise<Contribute>;
    claim(): Promise<Claim>;
    finalize(): Promise<Finalize>;
    refund(): Promise<Refund>;
    emergencyWithdraw(): Promise<EmergencyWithdraw>;
    pause(): Promise<Pause>;
    unpause(): Promise<Unpause>;
    onOP20Received(operator: Address, from: Address, amount: bigint, data: Uint8Array): Promise<OnOP20Received>;
    getPresaleInfo(): Promise<GetPresaleInfo>;
    getContribution(contributor: Address): Promise<GetContribution>;
    getClaimable(contributor: Address): Promise<GetClaimable>;
    getRate(): Promise<GetRate>;
    getPlatformFee(): Promise<GetPlatformFee>;
    getPlatformFeeBps(): Promise<GetPlatformFeeBps>;
    isActive(): Promise<IsActive>;
    isSoftCapMet(): Promise<IsSoftCapMet>;
    isWhitelisted(account: Address): Promise<IsWhitelisted>;
    getVestingInfo(): Promise<GetVestingInfo>;
    isPaused(): Promise<IsPaused>;
    isCancelled(): Promise<IsCancelled>;
    isFinalized(): Promise<IsFinalized>;
    getContributorCount(): Promise<GetContributorCount>;
    getContributorByIndex(index: number): Promise<GetContributorByIndex>;
    getAntiBotConfig(): Promise<GetAntiBotConfig>;
}
