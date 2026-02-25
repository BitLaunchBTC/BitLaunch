// Vesting V2 Contract ABI — matches VestingContract.ts on-chain methods
// Block-based timing, TGE unlock, beneficiary/creator indexed lookups
import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const VESTING_ABI = [
    // ── Write Methods ──
    {
        name: 'createSchedule',
        inputs: [
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'cliffBlockCount', type: ABIDataTypes.UINT256 },
            { name: 'vestingBlockCount', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'tgeBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claim',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'claimable', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'revokeSchedule',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'returnedAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    // ── View Methods ──
    {
        name: 'getClaimable',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'claimable', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getSchedule',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'claimedAmount', type: ABIDataTypes.UINT256 },
            { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
            { name: 'vestingBlocks', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'tgeBps', type: ABIDataTypes.UINT256 },
            { name: 'revoked', type: ABIDataTypes.BOOL },
            { name: 'revocable', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getScheduleCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getBeneficiaryScheduleCount',
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getBeneficiaryScheduleByIndex',
        inputs: [
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT32 },
        ],
        outputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCreatorScheduleCount',
        inputs: [{ name: 'creator', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCreatorScheduleByIndex',
        inputs: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT32 },
        ],
        outputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    // ── Events ──
    {
        name: 'ScheduleCreated',
        values: [
            { name: 'scheduleId', type: ABIDataTypes.UINT256 },
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'TokensClaimed',
        values: [
            { name: 'scheduleId', type: ABIDataTypes.UINT256 },
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'ScheduleRevoked',
        values: [
            { name: 'scheduleId', type: ABIDataTypes.UINT256 },
            { name: 'returnedAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    ...OP_NET_ABI,
];
