import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const PresaleFactoryEvents = [
    {
        name: 'PresaleDeployed',
        values: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'presale', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
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
];

export const PresaleFactoryAbi = [
    {
        name: 'createPresale',
        inputs: [
            { name: 'tokenAddr', type: ABIDataTypes.ADDRESS },
            { name: 'hardCap', type: ABIDataTypes.UINT256 },
            { name: 'softCap', type: ABIDataTypes.UINT256 },
            { name: 'rate', type: ABIDataTypes.UINT256 },
            { name: 'minBuy', type: ABIDataTypes.UINT256 },
            { name: 'maxBuy', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'presaleAddress', type: ABIDataTypes.ADDRESS }],
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
        name: 'owner',
        inputs: [],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'transferOwnership',
        inputs: [{ name: 'newOwner', type: ABIDataTypes.ADDRESS }],
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
        name: 'setPlatformWallet',
        inputs: [{ name: 'newPlatformWallet', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setDefaultFeeBps',
        inputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isPaused',
        inputs: [],
        outputs: [{ name: 'isPaused', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getDefaultFeeBps',
        inputs: [],
        outputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPresaleCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPresaleByIndex',
        inputs: [{ name: 'index', type: ABIDataTypes.UINT32 }],
        outputs: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'presale', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPresaleCreator',
        inputs: [{ name: 'presaleAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'creator', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCreatorPresaleCount',
        inputs: [{ name: 'creator', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCreatorPresaleByIndex',
        inputs: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT32 },
        ],
        outputs: [
            { name: 'presale', type: ABIDataTypes.ADDRESS },
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
    ...PresaleFactoryEvents,
    ...OP_NET_ABI,
];

export default PresaleFactoryAbi;
