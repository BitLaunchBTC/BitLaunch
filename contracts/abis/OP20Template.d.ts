import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type FreeMintConfiguredEvent = {
    readonly token: Address;
    readonly supply: bigint;
    readonly perTxLimit: bigint;
    readonly userCap: bigint;
};
export type MintedEvent = {
    readonly to: Address;
    readonly amount: bigint;
};
export type FreeMintClaimedEvent = {
    readonly user: Address;
    readonly token: Address;
    readonly amount: bigint;
};
export type TokenBurnedEvent = {
    readonly from: Address;
    readonly amount: bigint;
};
export type TokenPausedEvent = {
    readonly by: Address;
};
export type TokenUnpausedEvent = {
    readonly by: Address;
};
export type TokenOwnerTransferredEvent = {
    readonly previousOwner: Address;
    readonly newOwner: Address;
};
export type OwnershipRenouncedEvent = {
    readonly previousOwner: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the initialize function call.
 */
export type Initialize = CallResult<{}, OPNetEvent<FreeMintConfiguredEvent>[]>;

/**
 * @description Represents the result of the mint function call.
 */
export type Mint = CallResult<{}, OPNetEvent<MintedEvent>[]>;

/**
 * @description Represents the result of the freeMint function call.
 */
export type FreeMint = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<FreeMintClaimedEvent>[]
>;

/**
 * @description Represents the result of the burn function call.
 */
export type Burn = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<TokenBurnedEvent>[]
>;

/**
 * @description Represents the result of the pause function call.
 */
export type Pause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<TokenPausedEvent>[]
>;

/**
 * @description Represents the result of the unpause function call.
 */
export type Unpause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<TokenUnpausedEvent>[]
>;

/**
 * @description Represents the result of the grantMinterRole function call.
 */
export type GrantMinterRole = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the revokeMinterRole function call.
 */
export type RevokeMinterRole = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isMinter function call.
 */
export type IsMinter = CallResult<
    {
        isMinter: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the deployer function call.
 */
export type Deployer = CallResult<
    {
        deployer: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTokenOwner function call.
 */
export type GetTokenOwner = CallResult<
    {
        owner: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getFactoryAddress function call.
 */
export type GetFactoryAddress = CallResult<
    {
        factory: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the transferTokenOwner function call.
 */
export type TransferTokenOwner = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<TokenOwnerTransferredEvent>[]
>;

/**
 * @description Represents the result of the renounceOwnership function call.
 */
export type RenounceOwnership = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OwnershipRenouncedEvent>[]
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
 * @description Represents the result of the isBurnEnabledView function call.
 */
export type IsBurnEnabledView = CallResult<
    {
        burnEnabled: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getFreeMintInfo function call.
 */
export type GetFreeMintInfo = CallResult<
    {
        info: Uint8Array;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getFreeMintClaimed function call.
 */
export type GetFreeMintClaimed = CallResult<
    {
        claimed: bigint;
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
// IOP20Template
// ------------------------------------------------------------------
export interface IOP20Template extends IOP_NETContract {
    initialize(
        maxSupply: bigint,
        decimals: number,
        name: string,
        symbol: string,
        initialMintTo: Address,
        initialMintAmount: bigint,
        freeMintSupply: bigint,
        freeMintPerTx: bigint,
        freeMintUserCap: bigint,
        tokenOwner: Address,
        burnEnabled: boolean,
    ): Promise<Initialize>;
    mint(to: Address, amount: bigint): Promise<Mint>;
    freeMint(amount: bigint): Promise<FreeMint>;
    burn(amount: bigint): Promise<Burn>;
    pause(): Promise<Pause>;
    unpause(): Promise<Unpause>;
    grantMinterRole(minter: Address): Promise<GrantMinterRole>;
    revokeMinterRole(minter: Address): Promise<RevokeMinterRole>;
    isMinter(account: Address): Promise<IsMinter>;
    deployer(): Promise<Deployer>;
    getTokenOwner(): Promise<GetTokenOwner>;
    getFactoryAddress(): Promise<GetFactoryAddress>;
    transferTokenOwner(newOwner: Address): Promise<TransferTokenOwner>;
    renounceOwnership(): Promise<RenounceOwnership>;
    isPaused(): Promise<IsPaused>;
    isBurnEnabledView(): Promise<IsBurnEnabledView>;
    getFreeMintInfo(): Promise<GetFreeMintInfo>;
    getFreeMintClaimed(user: Address): Promise<GetFreeMintClaimed>;
    onOP20Received(operator: Address, from: Address, amount: bigint, data: Uint8Array): Promise<OnOP20Received>;
}
