// Liquidity Lock V2 Contract ABI — matches LiquidityLockContract.ts on-chain methods
// Block-based unlock, partial unlock, lock ownership transfer, owner-indexed lookups
import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const LOCK_ABI = [
    // ── Write Methods ──
    {
        name: 'lockTokens',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'lockId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unlock',
        inputs: [{ name: 'lockId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'partialUnlock',
        inputs: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'remaining', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'extendLock',
        inputs: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'newUnlockBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'transferLockOwnership',
        inputs: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'newOwner', type: ABIDataTypes.ADDRESS },
        ],
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
        name: 'setPlatformFeeBps',
        inputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    // ── View Methods ──
    {
        name: 'getLock',
        inputs: [{ name: 'lockId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
            { name: 'withdrawn', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getLockCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTotalFees',
        inputs: [],
        outputs: [{ name: 'totalFees', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPlatformFeeBps',
        inputs: [],
        outputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isUnlockable',
        inputs: [{ name: 'lockId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'unlockable', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOwnerLockCount',
        inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOwnerLockByIndex',
        inputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT32 },
        ],
        outputs: [{ name: 'lockId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    // ── Events ──
    {
        name: 'TokensLocked',
        values: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'fee', type: ABIDataTypes.UINT256 },
            { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'TokensUnlocked',
        values: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PartialUnlock',
        values: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'remaining', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'LockExtended',
        values: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'newUnlockBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'LockOwnershipTransferred',
        values: [
            { name: 'lockId', type: ABIDataTypes.UINT256 },
            { name: 'previousOwner', type: ABIDataTypes.ADDRESS },
            { name: 'newOwner', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
    ...OP_NET_ABI,
];
