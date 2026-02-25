import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const PresaleContractEvents = [
    {
        name: 'PresaleCreated',
        values: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'hardCap', type: ABIDataTypes.UINT256 },
            { name: 'softCap', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Contributed',
        values: [
            { name: 'contributor', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Claimed',
        values: [
            { name: 'claimer', type: ABIDataTypes.ADDRESS },
            { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Finalized',
        values: [
            { name: 'totalRaised', type: ABIDataTypes.UINT256 },
            { name: 'platformFee', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Refunded',
        values: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PresaleCancelled',
        values: [
            { name: 'by', type: ABIDataTypes.ADDRESS },
            { name: 'tokensReturned', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PresalePaused',
        values: [{ name: 'by', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PresaleUnpaused',
        values: [{ name: 'by', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Event,
    },
];

export const PresaleContractAbi = [
    {
        name: 'initialize',
        inputs: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'platformWallet', type: ABIDataTypes.ADDRESS },
            { name: 'tokenAddr', type: ABIDataTypes.ADDRESS },
            { name: 'hardCap', type: ABIDataTypes.UINT256 },
            { name: 'softCap', type: ABIDataTypes.UINT256 },
            { name: 'rate', type: ABIDataTypes.UINT256 },
            { name: 'minBuy', type: ABIDataTypes.UINT256 },
            { name: 'maxBuy', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
            { name: 'feeBps', type: ABIDataTypes.UINT256 },
            { name: 'pullTokens', type: ABIDataTypes.BOOL },
            { name: 'vestingCliff', type: ABIDataTypes.UINT256 },
            { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
            { name: 'vestingTgeBps', type: ABIDataTypes.UINT256 },
            { name: 'antiBotMaxPerBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setVesting',
        inputs: [
            { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
            { name: 'tgeBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setAntiBot',
        inputs: [{ name: 'maxPerBlock', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'enableWhitelist',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'disableWhitelist',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'addToWhitelist',
        inputs: [{ name: 'account', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'addBatchToWhitelist',
        inputs: [{ name: 'data', type: ABIDataTypes.BYTES }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'removeFromWhitelist',
        inputs: [{ name: 'account', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'contribute',
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claim',
        inputs: [],
        outputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'finalize',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'refund',
        inputs: [],
        outputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'emergencyWithdraw',
        inputs: [],
        outputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'pause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unpause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
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
    {
        name: 'getPresaleInfo',
        inputs: [],
        outputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'hardCap', type: ABIDataTypes.UINT256 },
            { name: 'softCap', type: ABIDataTypes.UINT256 },
            { name: 'totalRaised', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getContribution',
        inputs: [{ name: 'contributor', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'contribution', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getClaimable',
        inputs: [{ name: 'contributor', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'claimable', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getRate',
        inputs: [],
        outputs: [{ name: 'rate', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPlatformFee',
        inputs: [],
        outputs: [{ name: 'platformFee', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPlatformFeeBps',
        inputs: [],
        outputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isActive',
        inputs: [],
        outputs: [{ name: 'active', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isSoftCapMet',
        inputs: [],
        outputs: [{ name: 'met', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isWhitelisted',
        inputs: [{ name: 'account', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'whitelisted', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getVestingInfo',
        inputs: [],
        outputs: [
            { name: 'enabled', type: ABIDataTypes.BOOL },
            { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
            { name: 'tgeBps', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isPaused',
        inputs: [],
        outputs: [{ name: 'paused', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isCancelled',
        inputs: [],
        outputs: [{ name: 'cancelled', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isFinalized',
        inputs: [],
        outputs: [{ name: 'finalized', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getContributorCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getContributorByIndex',
        inputs: [{ name: 'index', type: ABIDataTypes.UINT32 }],
        outputs: [
            { name: 'contributor', type: ABIDataTypes.ADDRESS },
            { name: 'contribution', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAntiBotConfig',
        inputs: [],
        outputs: [{ name: 'maxPerBlock', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...PresaleContractEvents,
    ...OP_NET_ABI,
];

export default PresaleContractAbi;
