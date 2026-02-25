import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type ScheduleCreatedEvent = {
    readonly scheduleId: bigint;
    readonly beneficiary: Address;
    readonly token: Address;
    readonly totalAmount: bigint;
};
export type TokensClaimedEvent = {
    readonly scheduleId: bigint;
    readonly beneficiary: Address;
    readonly amount: bigint;
};
export type ScheduleRevokedEvent = {
    readonly scheduleId: bigint;
    readonly returnedAmount: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createSchedule function call.
 */
export type CreateSchedule = CallResult<
    {
        scheduleId: bigint;
    },
    OPNetEvent<ScheduleCreatedEvent>[]
>;

/**
 * @description Represents the result of the claim function call.
 */
export type Claim = CallResult<
    {
        claimable: bigint;
    },
    OPNetEvent<TokensClaimedEvent>[]
>;

/**
 * @description Represents the result of the revokeSchedule function call.
 */
export type RevokeSchedule = CallResult<
    {
        returnedAmount: bigint;
    },
    OPNetEvent<ScheduleRevokedEvent>[]
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
 * @description Represents the result of the getSchedule function call.
 */
export type GetSchedule = CallResult<
    {
        beneficiary: Address;
        token: Address;
        creator: Address;
        totalAmount: bigint;
        claimedAmount: bigint;
        cliffBlocks: bigint;
        vestingBlocks: bigint;
        startBlock: bigint;
        tgeBps: bigint;
        revoked: boolean;
        revocable: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getScheduleCount function call.
 */
export type GetScheduleCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getBeneficiaryScheduleCount function call.
 */
export type GetBeneficiaryScheduleCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getBeneficiaryScheduleByIndex function call.
 */
export type GetBeneficiaryScheduleByIndex = CallResult<
    {
        scheduleId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCreatorScheduleCount function call.
 */
export type GetCreatorScheduleCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCreatorScheduleByIndex function call.
 */
export type GetCreatorScheduleByIndex = CallResult<
    {
        scheduleId: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IVestingContract
// ------------------------------------------------------------------
export interface IVestingContract extends IOP_NETContract {
    createSchedule(
        beneficiary: Address,
        token: Address,
        totalAmount: bigint,
        cliffBlockCount: bigint,
        vestingBlockCount: bigint,
        startBlock: bigint,
        tgeBps: bigint,
    ): Promise<CreateSchedule>;
    claim(scheduleId: bigint): Promise<Claim>;
    revokeSchedule(scheduleId: bigint): Promise<RevokeSchedule>;
    getClaimable(scheduleId: bigint): Promise<GetClaimable>;
    getSchedule(scheduleId: bigint): Promise<GetSchedule>;
    getScheduleCount(): Promise<GetScheduleCount>;
    getBeneficiaryScheduleCount(beneficiary: Address): Promise<GetBeneficiaryScheduleCount>;
    getBeneficiaryScheduleByIndex(beneficiary: Address, index: number): Promise<GetBeneficiaryScheduleByIndex>;
    getCreatorScheduleCount(creator: Address): Promise<GetCreatorScheduleCount>;
    getCreatorScheduleByIndex(creator: Address, index: number): Promise<GetCreatorScheduleByIndex>;
}
