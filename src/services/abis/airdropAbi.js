// Airdrop Contract ABI — matches AirdropContract.ts on-chain methods
// Merkle claim-based airdrop for OPNet dual-address system
import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const AIRDROP_ABI = [
    // ── Write Methods ──
    {
        name: 'createAirdrop',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'merkleRoot', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claim',
        inputs: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'proof', type: ABIDataTypes.BYTES },
        ],
        outputs: [{ name: 'claimedAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelAirdrop',
        inputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'refundedAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'recoverExpired',
        inputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'recoveredAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    // ── View Methods ──
    {
        name: 'hasClaimed',
        inputs: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'claimer', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'claimed', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getClaimedAmount',
        inputs: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'claimer', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'claimedAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAirdrop',
        inputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'claimedAmount', type: ABIDataTypes.UINT256 },
            { name: 'merkleRoot', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
            { name: 'cancelled', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAirdropCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getRemainingAmount',
        inputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'remaining', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isActive',
        inputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'active', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCreatorAirdropCount',
        inputs: [{ name: 'creator', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCreatorAirdropByIndex',
        inputs: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT32 },
        ],
        outputs: [{ name: 'airdropId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'verifyProof',
        inputs: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'claimer', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'proof', type: ABIDataTypes.BYTES },
        ],
        outputs: [{ name: 'valid', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    // ── Events ──
    {
        name: 'AirdropCreated',
        values: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'TokensClaimed',
        values: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'claimer', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'AirdropCancelled',
        values: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'refundedAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'AirdropExpiredRecovered',
        values: [
            { name: 'airdropId', type: ABIDataTypes.UINT256 },
            { name: 'recoveredAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    ...OP_NET_ABI,
];
