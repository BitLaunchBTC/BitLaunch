// BitLaunch Vesting Contract V2
// Manages token vesting schedules with cliff + linear release.
//
// V2 Changes:
//   - Block-based vesting (Blockchain.block.number) — fixes medianTimestamp vulnerability
//   - TGE unlock per schedule (immediate partial release at vest start)
//   - Beneficiary-indexed lookup (efficient dashboard queries)
//   - Revocable flag per schedule (creator decides at creation time)
//   - Creator-indexed lookup (see all created schedules)

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    AddressMemoryMap,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    NetEvent,
    Revert,
    SafeMath,
    StoredU256,
    StoredMapU256,
    TransferHelper,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { ReentrancyGuard, ReentrancyLevel } from '@btc-vision/btc-runtime/runtime/contracts/ReentrancyGuard';

const BPS_DENOMINATOR: u256 = u256.fromU32(10000);

// ── Storage Pointers ──
// Per-schedule fields (key = scheduleId)
const SCHEDULE_COUNT_POINTER: u16 = Blockchain.nextPointer;
const BENEFICIARY_POINTER: u16 = Blockchain.nextPointer;       // scheduleId → beneficiary
const TOKEN_POINTER: u16 = Blockchain.nextPointer;              // scheduleId → token
const TOTAL_AMOUNT_POINTER: u16 = Blockchain.nextPointer;       // scheduleId → total
const CLAIMED_AMOUNT_POINTER: u16 = Blockchain.nextPointer;     // scheduleId → claimed
const CLIFF_BLOCKS_POINTER: u16 = Blockchain.nextPointer;       // V2: blocks
const VESTING_BLOCKS_POINTER: u16 = Blockchain.nextPointer;     // V2: blocks
const START_BLOCK_POINTER: u16 = Blockchain.nextPointer;        // V2: block number
const CREATOR_POINTER: u16 = Blockchain.nextPointer;            // scheduleId → creator
const REVOKED_POINTER: u16 = Blockchain.nextPointer;
const TGE_BPS_POINTER: u16 = Blockchain.nextPointer;            // V2: TGE basis points
const REVOCABLE_POINTER: u16 = Blockchain.nextPointer;          // V2: revocable flag
// Per-user counts
const BENEFICIARY_COUNT_POINTER: u16 = Blockchain.nextPointer;  // V2: beneficiary → count
const CREATOR_COUNT_POINTER: u16 = Blockchain.nextPointer;      // V2: creator → count

// ── Events ──

@final
class ScheduleCreatedEvent extends NetEvent {
    constructor(scheduleId: u256, beneficiary: Address, token: Address, totalAmount: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH,
        );
        data.writeU256(scheduleId);
        data.writeAddress(beneficiary);
        data.writeAddress(token);
        data.writeU256(totalAmount);
        super('ScheduleCreated', data);
    }
}

@final
class TokensClaimedEvent extends NetEvent {
    constructor(scheduleId: u256, beneficiary: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeU256(scheduleId);
        data.writeAddress(beneficiary);
        data.writeU256(amount);
        super('TokensClaimed', data);
    }
}

@final
class ScheduleRevokedEvent extends NetEvent {
    constructor(scheduleId: u256, returnedAmount: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        data.writeU256(scheduleId);
        data.writeU256(returnedAmount);
        super('ScheduleRevoked', data);
    }
}

// ── Main Contract ──

@final
export class VestingContract extends ReentrancyGuard {
    protected override readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    // Per-schedule storage (key = scheduleId)
    private readonly scheduleCount: StoredU256;
    private readonly beneficiaries: StoredMapU256;
    private readonly tokens: StoredMapU256;
    private readonly totalAmounts: StoredMapU256;
    private readonly claimedAmounts: StoredMapU256;
    private readonly cliffBlocks: StoredMapU256;       // V2: blocks
    private readonly vestingBlocks: StoredMapU256;     // V2: blocks
    private readonly startBlocks: StoredMapU256;       // V2: block number
    private readonly creators: StoredMapU256;
    private readonly revoked: StoredMapU256;
    private readonly tgeBpsMap: StoredMapU256;          // V2: TGE per schedule
    private readonly revocableMap: StoredMapU256;       // V2: revocable flag

    // Per-user tracking
    private readonly beneficiaryScheduleCount: AddressMemoryMap;  // V2
    private readonly creatorScheduleCount: AddressMemoryMap;      // V2

    public constructor() {
        super();

        this.scheduleCount = new StoredU256(SCHEDULE_COUNT_POINTER, EMPTY_POINTER);
        this.beneficiaries = new StoredMapU256(BENEFICIARY_POINTER);
        this.tokens = new StoredMapU256(TOKEN_POINTER);
        this.totalAmounts = new StoredMapU256(TOTAL_AMOUNT_POINTER);
        this.claimedAmounts = new StoredMapU256(CLAIMED_AMOUNT_POINTER);
        this.cliffBlocks = new StoredMapU256(CLIFF_BLOCKS_POINTER);
        this.vestingBlocks = new StoredMapU256(VESTING_BLOCKS_POINTER);
        this.startBlocks = new StoredMapU256(START_BLOCK_POINTER);
        this.creators = new StoredMapU256(CREATOR_POINTER);
        this.revoked = new StoredMapU256(REVOKED_POINTER);
        this.tgeBpsMap = new StoredMapU256(TGE_BPS_POINTER);
        this.revocableMap = new StoredMapU256(REVOCABLE_POINTER);
        this.beneficiaryScheduleCount = new AddressMemoryMap(BENEFICIARY_COUNT_POINTER);
        this.creatorScheduleCount = new AddressMemoryMap(CREATOR_COUNT_POINTER);
    }

    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);
    }

    // ══════════════════════════════════════════════════════════════
    // ██ WRITE METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Create a new vesting schedule.
     * V2: Block-based, with TGE and revocable flag.
     * Creator must approve this contract to spend their tokens first.
     *
     * @param beneficiary - who receives vested tokens
     * @param token - OP20 token address
     * @param totalAmount - total tokens to vest
     * @param cliffBlockCount - blocks after startBlock before vesting begins
     * @param vestingBlockCount - total blocks for full vesting (after cliff)
     * @param startBlock - block number when vesting starts
     * @param tgeBps - basis points released immediately at TGE (0-10000)
     */
    @method(
        { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        { name: 'cliffBlockCount', type: ABIDataTypes.UINT256 },
        { name: 'vestingBlockCount', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'tgeBps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @emit('ScheduleCreated')
    public createSchedule(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();
        if (beneficiary.isZero()) throw new Revert('Invalid beneficiary address');

        const token: Address = calldata.readAddress();
        if (token.isZero()) throw new Revert('Invalid token address');

        const totalAmount: u256 = calldata.readU256();
        if (totalAmount.isZero()) throw new Revert('Amount must be > 0');

        const cliffBlockCount: u256 = calldata.readU256();
        const vestingBlockCount: u256 = calldata.readU256();
        if (vestingBlockCount.isZero()) throw new Revert('Vesting duration must be > 0');

        // V2: Block-based start
        const startBlock: u256 = calldata.readU256();
        if (startBlock.isZero()) throw new Revert('Start block must be > 0');

        // V2: TGE basis points
        const tgeBps: u256 = calldata.readU256();
        if (tgeBps > BPS_DENOMINATOR) throw new Revert('TGE BPS must be <= 10000');

        const sender: Address = Blockchain.tx.sender;
        const scheduleId: u256 = this.scheduleCount.value;

        // Store schedule data
        this.beneficiaries.set(scheduleId, this._addressToU256(beneficiary));
        this.tokens.set(scheduleId, this._addressToU256(token));
        this.totalAmounts.set(scheduleId, totalAmount);
        this.claimedAmounts.set(scheduleId, u256.Zero);
        this.cliffBlocks.set(scheduleId, cliffBlockCount);
        this.vestingBlocks.set(scheduleId, vestingBlockCount);
        this.startBlocks.set(scheduleId, startBlock);
        this.creators.set(scheduleId, this._addressToU256(sender));
        this.revoked.set(scheduleId, u256.Zero);
        this.tgeBpsMap.set(scheduleId, tgeBps);
        // Schedule is revocable by default (creator can revoke)
        this.revocableMap.set(scheduleId, u256.One);

        this.scheduleCount.value = SafeMath.add(scheduleId, u256.One);

        // V2: Update user counts
        const bCount: u256 = this.beneficiaryScheduleCount.get(beneficiary);
        this.beneficiaryScheduleCount.set(beneficiary, SafeMath.add(bCount, u256.One));
        const cCount: u256 = this.creatorScheduleCount.get(sender);
        this.creatorScheduleCount.set(sender, SafeMath.add(cCount, u256.One));

        // Pull tokens from creator
        TransferHelper.transferFrom(token, sender, Blockchain.contract.address, totalAmount);

        this.emitEvent(new ScheduleCreatedEvent(scheduleId, beneficiary, token, totalAmount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(scheduleId);
        return response;
    }

    /**
     * Claim vested tokens. Only beneficiary can call.
     * V2: Block-based vesting with TGE support.
     */
    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'claimable', type: ABIDataTypes.UINT256 })
    @emit('TokensClaimed')
    public claim(calldata: Calldata): BytesWriter {
        const scheduleId: u256 = calldata.readU256();
        this._requireValidSchedule(scheduleId);

        const sender: Address = Blockchain.tx.sender;
        const beneficiary: Address = this._u256ToAddress(this.beneficiaries.get(scheduleId));

        if (!sender.equals(beneficiary)) throw new Revert('Only beneficiary');
        if (!this.revoked.get(scheduleId).isZero()) throw new Revert('Schedule revoked');

        const claimable: u256 = this._computeClaimable(scheduleId);
        if (claimable.isZero()) throw new Revert('Nothing to claim');

        // Effects first (CEI pattern)
        const newClaimed: u256 = SafeMath.add(this.claimedAmounts.get(scheduleId), claimable);
        this.claimedAmounts.set(scheduleId, newClaimed);

        // Transfer tokens
        const token: Address = this._u256ToAddress(this.tokens.get(scheduleId));
        TransferHelper.transfer(token, sender, claimable);

        this.emitEvent(new TokensClaimedEvent(scheduleId, sender, claimable));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(claimable);
        return response;
    }

    /**
     * Revoke a vesting schedule (creator only).
     * V2: Only works if schedule was marked as revocable.
     * Returns unvested tokens to creator.
     */
    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'returnedAmount', type: ABIDataTypes.UINT256 })
    @emit('ScheduleRevoked')
    public revokeSchedule(calldata: Calldata): BytesWriter {
        const scheduleId: u256 = calldata.readU256();
        this._requireValidSchedule(scheduleId);

        const sender: Address = Blockchain.tx.sender;
        const creator: Address = this._u256ToAddress(this.creators.get(scheduleId));

        if (!sender.equals(creator)) throw new Revert('Only creator');
        if (!this.revoked.get(scheduleId).isZero()) throw new Revert('Already revoked');

        // V2: Check revocable flag
        if (this.revocableMap.get(scheduleId).isZero()) {
            throw new Revert('Schedule is not revocable');
        }

        const vestedSoFar: u256 = this._computeVested(scheduleId);
        const totalAmount: u256 = this.totalAmounts.get(scheduleId);
        const returnedAmount: u256 = SafeMath.sub(totalAmount, vestedSoFar);

        // Effects
        this.revoked.set(scheduleId, u256.One);
        this.totalAmounts.set(scheduleId, vestedSoFar);

        // Return unvested tokens to creator
        if (!returnedAmount.isZero()) {
            const token: Address = this._u256ToAddress(this.tokens.get(scheduleId));
            TransferHelper.transfer(token, creator, returnedAmount);
        }

        this.emitEvent(new ScheduleRevokedEvent(scheduleId, returnedAmount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(returnedAmount);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ VIEW METHODS
    // ══════════════════════════════════════════════════════════════

    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'claimable', type: ABIDataTypes.UINT256 })
    public getClaimable(calldata: Calldata): BytesWriter {
        const scheduleId: u256 = calldata.readU256();
        this._requireValidSchedule(scheduleId);

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this._computeClaimable(scheduleId));
        return response;
    }

    /**
     * Get full schedule details.
     * V2: Includes startBlock, tgeBps, revocable flag.
     */
    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns(
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
    )
    public getSchedule(calldata: Calldata): BytesWriter {
        const scheduleId: u256 = calldata.readU256();
        this._requireValidSchedule(scheduleId);

        const response: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 3 + U256_BYTE_LENGTH * 5 + 2,
        );
        response.writeAddress(this._u256ToAddress(this.beneficiaries.get(scheduleId)));
        response.writeAddress(this._u256ToAddress(this.tokens.get(scheduleId)));
        response.writeAddress(this._u256ToAddress(this.creators.get(scheduleId)));
        response.writeU256(this.totalAmounts.get(scheduleId));
        response.writeU256(this.claimedAmounts.get(scheduleId));
        response.writeU256(this.cliffBlocks.get(scheduleId));
        response.writeU256(this.vestingBlocks.get(scheduleId));
        response.writeU256(this.startBlocks.get(scheduleId));
        response.writeU256(this.tgeBpsMap.get(scheduleId));
        response.writeBoolean(!this.revoked.get(scheduleId).isZero());
        response.writeBoolean(!this.revocableMap.get(scheduleId).isZero());
        return response;
    }

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getScheduleCount(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.scheduleCount.value);
        return response;
    }

    // ── V2: Beneficiary-Indexed Lookups ──

    /**
     * V2: Get how many schedules a beneficiary has.
     */
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getBeneficiaryScheduleCount(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();
        const count: u256 = this.beneficiaryScheduleCount.get(beneficiary);

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * V2: Get a beneficiary's schedule by local index.
     * Iterates all schedules, returns the Nth matching schedule ID.
     */
    @method(
        { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT32 },
    )
    @returns({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    public getBeneficiaryScheduleByIndex(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();
        const targetIndex: u32 = calldata.readU32();

        const total: u32 = this.scheduleCount.value.toU32();
        let matched: u32 = 0;

        for (let i: u32 = 0; i < total; i++) {
            const sid: u256 = u256.fromU32(i);
            const beneficiaryU256: u256 = this.beneficiaries.get(sid);
            const schedBeneficiary: Address = this._u256ToAddress(beneficiaryU256);

            if (schedBeneficiary.equals(beneficiary)) {
                if (matched == targetIndex) {
                    const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
                    response.writeU256(sid);
                    return response;
                }
                matched++;
            }
        }

        throw new Revert('Index out of bounds');
    }

    /**
     * V2: Get how many schedules a creator has made.
     */
    @method({ name: 'creator', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getCreatorScheduleCount(calldata: Calldata): BytesWriter {
        const creator: Address = calldata.readAddress();
        const count: u256 = this.creatorScheduleCount.get(creator);

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * V2: Get a creator's schedule by local index.
     */
    @method(
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT32 },
    )
    @returns({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    public getCreatorScheduleByIndex(calldata: Calldata): BytesWriter {
        const creator: Address = calldata.readAddress();
        const targetIndex: u32 = calldata.readU32();

        const total: u32 = this.scheduleCount.value.toU32();
        let matched: u32 = 0;

        for (let i: u32 = 0; i < total; i++) {
            const sid: u256 = u256.fromU32(i);
            const creatorU256: u256 = this.creators.get(sid);
            const schedCreator: Address = this._u256ToAddress(creatorU256);

            if (schedCreator.equals(creator)) {
                if (matched == targetIndex) {
                    const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
                    response.writeU256(sid);
                    return response;
                }
                matched++;
            }
        }

        throw new Revert('Index out of bounds');
    }

    // ══════════════════════════════════════════════════════════════
    // ██ INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════

    /**
     * V2: Block-based vesting calculation with TGE.
     *
     * Timeline (in blocks):
     *   startBlock ──── cliffEnd ──── vestingEnd
     *   |  TGE only  |  cliff wait  |  linear vest  |  fully vested
     *
     * cliffEnd = startBlock + cliffBlocks
     * vestingEnd = cliffEnd + vestingBlocks
     */
    private _computeVested(scheduleId: u256): u256 {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const start: u256 = this.startBlocks.get(scheduleId);
        const cliff: u256 = this.cliffBlocks.get(scheduleId);
        const duration: u256 = this.vestingBlocks.get(scheduleId);
        const total: u256 = this.totalAmounts.get(scheduleId);
        const tgeBps: u256 = this.tgeBpsMap.get(scheduleId);

        // V2: TGE portion (released at startBlock)
        const tgeAmount: u256 = SafeMath.div(
            SafeMath.mul(total, tgeBps),
            BPS_DENOMINATOR,
        );
        const vestingAmount: u256 = SafeMath.sub(total, tgeAmount);

        // Before start — nothing vested
        if (currentBlock < start) return u256.Zero;

        // At or past start but before cliff end — only TGE
        const cliffEnd: u256 = SafeMath.add(start, cliff);
        if (currentBlock < cliffEnd) return tgeAmount;

        // Past full vesting — everything vested
        const vestingEnd: u256 = SafeMath.add(cliffEnd, duration);
        if (currentBlock >= vestingEnd) return total;

        // During linear vesting (after cliff)
        const elapsed: u256 = SafeMath.sub(currentBlock, cliffEnd);
        const vestedPortion: u256 = SafeMath.div(
            SafeMath.mul(vestingAmount, elapsed),
            duration,
        );

        return SafeMath.add(tgeAmount, vestedPortion);
    }

    private _computeClaimable(scheduleId: u256): u256 {
        const vested: u256 = this._computeVested(scheduleId);
        const claimed: u256 = this.claimedAmounts.get(scheduleId);
        if (vested <= claimed) return u256.Zero;
        return SafeMath.sub(vested, claimed);
    }

    private _requireValidSchedule(scheduleId: u256): void {
        if (scheduleId >= this.scheduleCount.value) throw new Revert('Invalid schedule');
    }

    private _addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private _u256ToAddress(val: u256): Address {
        return changetype<Address>(val.toUint8Array(true));
    }
}
