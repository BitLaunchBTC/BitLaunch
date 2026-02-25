import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type TokenDeployedEvent = {
    readonly deployer: Address;
    readonly tokenAddress: Address;
    readonly name: string;
    readonly symbol: string;
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
 * @description Represents the result of the deployToken function call.
 */
export type DeployToken = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<TokenDeployedEvent>[]
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
 * @description Represents the result of the setTemplate function call.
 */
export type SetTemplate = CallResult<
    {
        success: boolean;
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
 * @description Represents the result of the updateTokenOwner function call.
 */
export type UpdateTokenOwner = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
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
 * @description Represents the result of the isPaused function call.
 */
export type IsPaused = CallResult<
    {
        isPaused: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getDeploymentsCount function call.
 */
export type GetDeploymentsCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getDeploymentByIndex function call.
 */
export type GetDeploymentByIndex = CallResult<
    {
        deployer: Address;
        token: Address;
        block: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTokenDeployer function call.
 */
export type GetTokenDeployer = CallResult<
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
 * @description Represents the result of the getUserTokenCount function call.
 */
export type GetUserTokenCount = CallResult<
    {
        count: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getUserTokenByIndex function call.
 */
export type GetUserTokenByIndex = CallResult<
    {
        token: Address;
        block: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getDeploymentInfo function call.
 */
export type GetDeploymentInfo = CallResult<
    {
        has: boolean;
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
// IOP20Factory
// ------------------------------------------------------------------
export interface IOP20Factory extends IOP_NETContract {
    deployToken(
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
    ): Promise<DeployToken>;
    pauseFactory(): Promise<PauseFactory>;
    unpauseFactory(): Promise<UnpauseFactory>;
    setTemplate(newTemplate: Address): Promise<SetTemplate>;
    transferOwnership(newOwner: Address): Promise<TransferOwnership>;
    updateTokenOwner(tokenAddress: Address, newOwner: Address): Promise<UpdateTokenOwner>;
    owner(): Promise<Owner>;
    isPaused(): Promise<IsPaused>;
    getDeploymentsCount(): Promise<GetDeploymentsCount>;
    getDeploymentByIndex(index: number): Promise<GetDeploymentByIndex>;
    getTokenDeployer(tokenAddress: Address): Promise<GetTokenDeployer>;
    getTokenOwner(tokenAddress: Address): Promise<GetTokenOwner>;
    getUserTokenCount(deployer: Address): Promise<GetUserTokenCount>;
    getUserTokenByIndex(deployer: Address, index: number): Promise<GetUserTokenByIndex>;
    getDeploymentInfo(deployer: Address): Promise<GetDeploymentInfo>;
    onOP20Received(operator: Address, from: Address, amount: bigint, data: Uint8Array): Promise<OnOP20Received>;
}
