// OP20 Factory V2 Contract ABI — matches OP20Factory.ts on-chain methods
import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const FACTORY_ABI = [
    // ── Write Methods ──
    {
        name: 'deployToken',
        inputs: [
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'decimals', type: ABIDataTypes.UINT8 },
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
            { name: 'initialMintTo', type: ABIDataTypes.ADDRESS },
            { name: 'initialMintAmount', type: ABIDataTypes.UINT256 },
            { name: 'freeMintSupply', type: ABIDataTypes.UINT256 },
            { name: 'freeMintPerTx', type: ABIDataTypes.UINT256 },
            { name: 'freeMintUserCap', type: ABIDataTypes.UINT256 },
            { name: 'tokenOwner', type: ABIDataTypes.ADDRESS },
            { name: 'burnEnabled', type: ABIDataTypes.BOOL },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'pauseFactory',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unpauseFactory',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setTemplate',
        inputs: [{ name: 'newTemplate', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'transferOwnership',
        inputs: [{ name: 'newOwner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'updateTokenOwner',
        inputs: [
            { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
            { name: 'newOwner', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    // ── View Methods ──
    {
        name: 'owner',
        inputs: [],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isPaused',
        inputs: [],
        outputs: [{ name: 'isPaused', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getDeploymentsCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getDeploymentByIndex',
        inputs: [{ name: 'index', type: ABIDataTypes.UINT32 }],
        outputs: [
            { name: 'deployer', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'block', type: ABIDataTypes.UINT64 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokenDeployer',
        inputs: [{ name: 'tokenAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'deployer', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokenOwner',
        inputs: [{ name: 'tokenAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserTokenCount',
        inputs: [{ name: 'deployer', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserTokenByIndex',
        inputs: [
            { name: 'deployer', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT32 },
        ],
        outputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'block', type: ABIDataTypes.UINT64 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getDeploymentInfo',
        inputs: [{ name: 'deployer', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'has', type: ABIDataTypes.BOOL },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'block', type: ABIDataTypes.UINT64 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'onOP20Received',
        inputs: [
            { name: 'operator', type: ABIDataTypes.ADDRESS },
            { name: 'from', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'data', type: ABIDataTypes.BYTES },
        ],
        outputs: [{ name: 'selector', type: ABIDataTypes.BYTES4 }],
        type: BitcoinAbiTypes.Function,
    },
    // ── Events ──
    {
        name: 'TokenDeployed',
        values: [
            { name: 'deployer', type: ABIDataTypes.ADDRESS },
            { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'FactoryPaused',
        values: [{ name: 'by', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'FactoryUnpaused',
        values: [{ name: 'by', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OwnershipTransferred',
        values: [
            { name: 'previousOwner', type: ABIDataTypes.ADDRESS },
            { name: 'newOwner', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
    ...OP_NET_ABI,
];
