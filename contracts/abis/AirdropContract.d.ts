import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type AirdropCreatedEvent = {
    readonly airdropId: bigint;
    readonly creator: Address;
    readonly token: Address;
    readonly totalAmount: bigint;
    readonly expiryBlock: bigint;
};
export type TokensClaimedEvent = {
    readonly airdropId: bigint;
    readonly claimer: Address;
    readonly amount: bigint;
};
export type AirdropCancelledEvent = {
    readonly airdropId: bigint;
    readonly refundedAmount: bigint;
};
export type AirdropExpiredRecoveredEvent = {
    readonly airdropId: bigint;
    readonly recoveredAmount: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createAirdrop function call.
 */
export type CreateAirdrop = CallResult<
    {
        airdropId: bigint;
    },
    OPNetEvent<AirdropCreatedEvent>[]
>;

/**
 * @description Represents the result of the claim function call.
 */
export type Claim = CallResult<
    {
        claimedAmount: bigint;
    },
    OPNetEvent<TokensClaimedEvent>[]
>;

/**
 * @description Represents the result of the cancelAirdrop function call.
 */
export type CancelAirdrop = CallResult<
    {
        refundedAmount: bigint;
    },
    OPNetEvent<AirdropCancelledEvent>[]
>;

/**
 * @description Represents the result of the recoverExpired function call.
 */
export type RecoverExpired = CallResult<
    {
        recoveredAmount: bigint;
    },
    OPNetEvent<AirdropExpiredRecoveredEvent>[]
>;

/**
 * @description Represents the result of the hasClaimed function call.
 */
export type HasClaimed = CallResult<
    {
        claimed: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getClaimedAmount function call.
 */
export type GetClaimedAmount = CallResult<
    {
        claimedAmount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAirdrop function call.
 */
export type GetAirdrop = CallResult<
    {
        creator: Address;
        token: Address;
        totalAmount: bigint;
        claimedAmount: bigint;
        merkleRoot: bigint;
        expiryBlock: bigint;
        cancelled: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAirdropCount function call.
 */
export type GetAirdropCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getRemainingAmount function call.
 */
export type GetRemainingAmount = CallResult<
    {
        remaining: bigint;
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
 * @description Represents the result of the getCreatorAirdropCount function call.
 */
export type GetCreatorAirdropCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCreatorAirdropByIndex function call.
 */
export type GetCreatorAirdropByIndex = CallResult<
    {
        airdropId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the verifyProof function call.
 */
export type VerifyProof = CallResult<
    {
        valid: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IAirdropContract
// ------------------------------------------------------------------
export interface IAirdropContract extends IOP_NETContract {
    createAirdrop(token: Address, totalAmount: bigint, merkleRoot: bigint, expiryBlock: bigint): Promise<CreateAirdrop>;
    claim(airdropId: bigint, amount: bigint, proof: Uint8Array): Promise<Claim>;
    cancelAirdrop(airdropId: bigint): Promise<CancelAirdrop>;
    recoverExpired(airdropId: bigint): Promise<RecoverExpired>;
    hasClaimed(airdropId: bigint, claimer: Address): Promise<HasClaimed>;
    getClaimedAmount(airdropId: bigint, claimer: Address): Promise<GetClaimedAmount>;
    getAirdrop(airdropId: bigint): Promise<GetAirdrop>;
    getAirdropCount(): Promise<GetAirdropCount>;
    getRemainingAmount(airdropId: bigint): Promise<GetRemainingAmount>;
    isActive(airdropId: bigint): Promise<IsActive>;
    getCreatorAirdropCount(creator: Address): Promise<GetCreatorAirdropCount>;
    getCreatorAirdropByIndex(creator: Address, index: number): Promise<GetCreatorAirdropByIndex>;
    verifyProof(airdropId: bigint, claimer: Address, amount: bigint, proof: Uint8Array): Promise<VerifyProof>;
}
