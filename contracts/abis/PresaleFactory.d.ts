import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type PresaleDeployedEvent = {
    readonly creator: Address;
    readonly presale: Address;
    readonly token: Address;
};
export type FactoryPausedEvent = {
    readonly by: Address;
};
export type FactoryUnpausedEvent = {
    readonly by: Address;
};
export type OwnershipTransferredEvent = {
    readonly previousOwner: Address;
    readonly newOwner: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createPresale function call.
 */
export type CreatePresale = CallResult<
    {
        presaleAddress: Address;
    },
    OPNetEvent<PresaleDeployedEvent>[]
>;

/**
 * @description Represents the result of the pauseFactory function call.
 */
export type PauseFactory = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<FactoryPausedEvent>[]
>;

/**
 * @description Represents the result of the unpauseFactory function call.
 */
export type UnpauseFactory = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<FactoryUnpausedEvent>[]
>;

/**
 * @description Represents the result of the owner function call.
 */
export type Owner = CallResult<
    {
        owner: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the transferOwnership function call.
 */
export type TransferOwnership = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OwnershipTransferredEvent>[]
>;

/**
 * @description Represents the result of the setTemplate function call.
 */
export type SetTemplate = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
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
 * @description Represents the result of the setDefaultFeeBps function call.
 */
export type SetDefaultFeeBps = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isPaused function call.
 */
export type IsPaused = CallResult<
    {
        isPaused: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getDefaultFeeBps function call.
 */
export type GetDefaultFeeBps = CallResult<
    {
        feeBps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPresaleCount function call.
 */
export type GetPresaleCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPresaleByIndex function call.
 */
export type GetPresaleByIndex = CallResult<
    {
        creator: Address;
        presale: Address;
        token: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPresaleCreator function call.
 */
export type GetPresaleCreator = CallResult<
    {
        creator: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCreatorPresaleCount function call.
 */
export type GetCreatorPresaleCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCreatorPresaleByIndex function call.
 */
export type GetCreatorPresaleByIndex = CallResult<
    {
        presale: Address;
        token: Address;
        block: bigint;
    },
    OPNetEvent<never>[]
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

// ------------------------------------------------------------------
// IPresaleFactory
// ------------------------------------------------------------------
export interface IPresaleFactory extends IOP_NETContract {
    createPresale(
        tokenAddr: Address,
        hardCap: bigint,
        softCap: bigint,
        rate: bigint,
        minBuy: bigint,
        maxBuy: bigint,
        startBlock: bigint,
        endBlock: bigint,
        tokenAmount: bigint,
    ): Promise<CreatePresale>;
    pauseFactory(): Promise<PauseFactory>;
    unpauseFactory(): Promise<UnpauseFactory>;
    owner(): Promise<Owner>;
    transferOwnership(newOwner: Address): Promise<TransferOwnership>;
    setTemplate(newTemplate: Address): Promise<SetTemplate>;
    setPlatformWallet(newPlatformWallet: Address): Promise<SetPlatformWallet>;
    setDefaultFeeBps(feeBps: bigint): Promise<SetDefaultFeeBps>;
    isPaused(): Promise<IsPaused>;
    getDefaultFeeBps(): Promise<GetDefaultFeeBps>;
    getPresaleCount(): Promise<GetPresaleCount>;
    getPresaleByIndex(index: number): Promise<GetPresaleByIndex>;
    getPresaleCreator(presaleAddress: Address): Promise<GetPresaleCreator>;
    getCreatorPresaleCount(creator: Address): Promise<GetCreatorPresaleCount>;
    getCreatorPresaleByIndex(creator: Address, index: number): Promise<GetCreatorPresaleByIndex>;
    onOP20Received(operator: Address, from: Address, amount: bigint, data: Uint8Array): Promise<OnOP20Received>;
}
