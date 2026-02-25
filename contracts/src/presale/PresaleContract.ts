// BitLaunch Presale Contract V2
// Full presale lifecycle: initialize → contribute → claim → finalize
//
// V2 Changes:
//   - Block-based timing (Blockchain.block.number) — fixes medianTimestamp vulnerability
//   - Anti-bot protection (max contributors per block)
//   - Batch whitelist (add multiple addresses at once)
//   - Contributor enumeration (on-chain list for UI)
//   - Configurable platform fee BPS (per-presale override)
//   - Vesting cliff/duration in blocks (not seconds)

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
    StoredAddress,
    StoredBoolean,
    StoredMapU256,
    StoredU256,
    TransferHelper,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { ReentrancyGuard, ReentrancyLevel } from '@btc-vision/btc-runtime/runtime/contracts/ReentrancyGuard';
import { ON_OP20_RECEIVED_SELECTOR } from '@btc-vision/btc-runtime/runtime/constants/Exports';

// Default platform fee: 200 basis points = 2%
const DEFAULT_PLATFORM_FEE_BPS: u256 = u256.fromU32(200);
const BPS_DENOMINATOR: u256 = u256.fromU32(10000);
const MAX_PLATFORM_FEE_BPS: u256 = u256.fromU32(1000); // Max 10% platform fee

// ── Storage Pointers ──
const CREATOR_POINTER: u16 = Blockchain.nextPointer;
const PLATFORM_WALLET_POINTER: u16 = Blockchain.nextPointer;
const TOKEN_POINTER: u16 = Blockchain.nextPointer;
const HARD_CAP_POINTER: u16 = Blockchain.nextPointer;
const SOFT_CAP_POINTER: u16 = Blockchain.nextPointer;
const TOKEN_RATE_POINTER: u16 = Blockchain.nextPointer;
const MIN_CONTRIBUTION_POINTER: u16 = Blockchain.nextPointer;
const MAX_CONTRIBUTION_POINTER: u16 = Blockchain.nextPointer;
const START_BLOCK_POINTER: u16 = Blockchain.nextPointer;         // V2: block-based
const END_BLOCK_POINTER: u16 = Blockchain.nextPointer;           // V2: block-based
const TOTAL_RAISED_POINTER: u16 = Blockchain.nextPointer;
const TOTAL_TOKENS_POINTER: u16 = Blockchain.nextPointer;
const CONTRIBUTIONS_POINTER: u16 = Blockchain.nextPointer;
const CLAIMED_POINTER: u16 = Blockchain.nextPointer;
const FINALIZED_POINTER: u16 = Blockchain.nextPointer;
const INITIALIZED_POINTER: u16 = Blockchain.nextPointer;
const PLATFORM_FEE_COLLECTED_POINTER: u16 = Blockchain.nextPointer;
const PLATFORM_FEE_BPS_POINTER: u16 = Blockchain.nextPointer;   // V2: configurable fee
const PAUSED_POINTER: u16 = Blockchain.nextPointer;
const CANCELLED_POINTER: u16 = Blockchain.nextPointer;
const WHITELIST_ENABLED_POINTER: u16 = Blockchain.nextPointer;
const WHITELIST_POINTER: u16 = Blockchain.nextPointer;
const VESTING_ENABLED_POINTER: u16 = Blockchain.nextPointer;
const VESTING_CLIFF_POINTER: u16 = Blockchain.nextPointer;      // V2: blocks, not seconds
const VESTING_DURATION_POINTER: u16 = Blockchain.nextPointer;   // V2: blocks, not seconds
const VESTING_TGE_BPS_POINTER: u16 = Blockchain.nextPointer;
// V2: Anti-bot
const ANTI_BOT_MAX_PER_BLOCK_POINTER: u16 = Blockchain.nextPointer;
const BLOCK_CONTRIBUTOR_COUNT_POINTER: u16 = Blockchain.nextPointer; // blockNum → count
// V2: Contributor enumeration
const CONTRIBUTOR_COUNT_POINTER: u16 = Blockchain.nextPointer;
const CONTRIBUTOR_LIST_POINTER: u16 = Blockchain.nextPointer;    // index → contributor (u256)
const CONTRIBUTOR_INDEX_POINTER: u16 = Blockchain.nextPointer;   // contributor → index+1

// ── Events ──

@final
class PresaleCreatedEvent extends NetEvent {
    constructor(creator: Address, token: Address, hardCap: u256, softCap: u256) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 2,
        );
        data.writeAddress(creator);
        data.writeAddress(token);
        data.writeU256(hardCap);
        data.writeU256(softCap);
        super('PresaleCreated', data);
    }
}

@final
class ContributedEvent extends NetEvent {
    constructor(contributor: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
        data.writeAddress(contributor);
        data.writeU256(amount);
        super('Contributed', data);
    }
}

@final
class ClaimedEvent extends NetEvent {
    constructor(claimer: Address, tokenAmount: u256) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
        data.writeAddress(claimer);
        data.writeU256(tokenAmount);
        super('Claimed', data);
    }
}

@final
class FinalizedEvent extends NetEvent {
    constructor(totalRaised: u256, platformFee: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        data.writeU256(totalRaised);
        data.writeU256(platformFee);
        super('Finalized', data);
    }
}

@final
class RefundedEvent extends NetEvent {
    constructor(creator: Address, tokenAmount: u256) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
        data.writeAddress(creator);
        data.writeU256(tokenAmount);
        super('Refunded', data);
    }
}

@final
class PausedEvent extends NetEvent {
    constructor(by: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(by);
        super('PresalePaused', data);
    }
}

@final
class UnpausedEvent extends NetEvent {
    constructor(by: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(by);
        super('PresaleUnpaused', data);
    }
}

@final
class CancelledEvent extends NetEvent {
    constructor(by: Address, tokensReturned: u256) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
        data.writeAddress(by);
        data.writeU256(tokensReturned);
        super('PresaleCancelled', data);
    }
}

// ── Main Contract ──

@final
export class PresaleContract extends ReentrancyGuard {
    protected override readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    // Core config
    private readonly creator: StoredAddress;
    private readonly platformWallet: StoredAddress;
    private readonly token: StoredAddress;
    private readonly hardCap: StoredU256;
    private readonly softCap: StoredU256;
    private readonly tokenRate: StoredU256;
    private readonly minContribution: StoredU256;
    private readonly maxContribution: StoredU256;
    private readonly startBlock: StoredU256;           // V2: block-based
    private readonly endBlock: StoredU256;              // V2: block-based
    private readonly totalRaised: StoredU256;
    private readonly totalTokens: StoredU256;

    // Per-user tracking
    private readonly contributions: AddressMemoryMap;
    private readonly claimed: AddressMemoryMap;        // cumulative tokens claimed per user

    // State flags
    private readonly finalized: StoredBoolean;
    private readonly initialized: StoredBoolean;
    private readonly paused: StoredBoolean;
    private readonly cancelled: StoredBoolean;

    // Platform fee
    private readonly platformFeeCollected: StoredU256;
    private readonly platformFeeBps: StoredU256;       // V2: configurable

    // Whitelist
    private readonly whitelistEnabled: StoredBoolean;
    private readonly whitelist: AddressMemoryMap;

    // Vesting (V2: block-based)
    private readonly vestingEnabled: StoredBoolean;
    private readonly vestingCliff: StoredU256;          // V2: blocks
    private readonly vestingDuration: StoredU256;       // V2: blocks
    private readonly vestingTgeBps: StoredU256;

    // V2: Anti-bot
    private readonly antiBotMaxPerBlock: StoredU256;
    private readonly blockContributorCount: StoredMapU256; // blockNum → count

    // V2: Contributor enumeration
    private readonly contributorCount: StoredU256;
    private readonly contributorList: StoredMapU256;    // index → contributorAsU256
    private readonly contributorIndex: AddressMemoryMap; // contributor → index+1 (0 = not listed)

    public constructor() {
        super();

        this.creator = new StoredAddress(CREATOR_POINTER);
        this.platformWallet = new StoredAddress(PLATFORM_WALLET_POINTER);
        this.token = new StoredAddress(TOKEN_POINTER);
        this.hardCap = new StoredU256(HARD_CAP_POINTER, EMPTY_POINTER);
        this.softCap = new StoredU256(SOFT_CAP_POINTER, EMPTY_POINTER);
        this.tokenRate = new StoredU256(TOKEN_RATE_POINTER, EMPTY_POINTER);
        this.minContribution = new StoredU256(MIN_CONTRIBUTION_POINTER, EMPTY_POINTER);
        this.maxContribution = new StoredU256(MAX_CONTRIBUTION_POINTER, EMPTY_POINTER);
        this.startBlock = new StoredU256(START_BLOCK_POINTER, EMPTY_POINTER);
        this.endBlock = new StoredU256(END_BLOCK_POINTER, EMPTY_POINTER);
        this.totalRaised = new StoredU256(TOTAL_RAISED_POINTER, EMPTY_POINTER);
        this.totalTokens = new StoredU256(TOTAL_TOKENS_POINTER, EMPTY_POINTER);
        this.contributions = new AddressMemoryMap(CONTRIBUTIONS_POINTER);
        this.claimed = new AddressMemoryMap(CLAIMED_POINTER);
        this.finalized = new StoredBoolean(FINALIZED_POINTER, false);
        this.initialized = new StoredBoolean(INITIALIZED_POINTER, false);
        this.platformFeeCollected = new StoredU256(PLATFORM_FEE_COLLECTED_POINTER, EMPTY_POINTER);
        this.platformFeeBps = new StoredU256(PLATFORM_FEE_BPS_POINTER, EMPTY_POINTER);
        this.paused = new StoredBoolean(PAUSED_POINTER, false);
        this.cancelled = new StoredBoolean(CANCELLED_POINTER, false);
        this.whitelistEnabled = new StoredBoolean(WHITELIST_ENABLED_POINTER, false);
        this.whitelist = new AddressMemoryMap(WHITELIST_POINTER);
        this.vestingEnabled = new StoredBoolean(VESTING_ENABLED_POINTER, false);
        this.vestingCliff = new StoredU256(VESTING_CLIFF_POINTER, EMPTY_POINTER);
        this.vestingDuration = new StoredU256(VESTING_DURATION_POINTER, EMPTY_POINTER);
        this.vestingTgeBps = new StoredU256(VESTING_TGE_BPS_POINTER, EMPTY_POINTER);
        this.antiBotMaxPerBlock = new StoredU256(ANTI_BOT_MAX_PER_BLOCK_POINTER, EMPTY_POINTER);
        this.blockContributorCount = new StoredMapU256(BLOCK_CONTRIBUTOR_COUNT_POINTER);
        this.contributorCount = new StoredU256(CONTRIBUTOR_COUNT_POINTER, EMPTY_POINTER);
        this.contributorList = new StoredMapU256(CONTRIBUTOR_LIST_POINTER);
        this.contributorIndex = new AddressMemoryMap(CONTRIBUTOR_INDEX_POINTER);
    }

    // Empty onDeployment for factory/template compatibility
    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);
    }

    // ══════════════════════════════════════════════════════════════
    // ██ WRITE METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Initialize the presale with all parameters.
     * V2: Uses block numbers instead of timestamps.
     * V2: Configurable platform fee BPS.
     *
     * For standalone: creator approves this contract, then calls initialize with pullTokens=true.
     * For factory: factory transfers tokens first, then calls initialize with pullTokens=false.
     */
    @method(
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
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('PresaleCreated')
    public initialize(calldata: Calldata): BytesWriter {
        if (this.initialized.value) throw new Revert('Already initialized');

        const creatorAddr: Address = calldata.readAddress();
        if (creatorAddr.isZero()) throw new Revert('Invalid creator');

        const platformAddr: Address = calldata.readAddress();
        if (platformAddr.isZero()) throw new Revert('Invalid platform wallet');

        const tokenAddr: Address = calldata.readAddress();
        if (tokenAddr.isZero()) throw new Revert('Invalid token address');

        const hardCapVal: u256 = calldata.readU256();
        if (hardCapVal.isZero()) throw new Revert('Hard cap must be > 0');

        const softCapVal: u256 = calldata.readU256();

        const rate: u256 = calldata.readU256();
        if (rate.isZero()) throw new Revert('Rate must be > 0');

        const minBuy: u256 = calldata.readU256();

        const maxBuy: u256 = calldata.readU256();
        if (maxBuy.isZero()) throw new Revert('Max buy must be > 0');

        // V2: Block-based timing
        const startBlockVal: u256 = calldata.readU256();
        const endBlockVal: u256 = calldata.readU256();
        if (endBlockVal.isZero()) throw new Revert('End block must be > 0');

        const tokenAmount: u256 = calldata.readU256();
        if (tokenAmount.isZero()) throw new Revert('Token amount must be > 0');

        // V2: Configurable platform fee
        const feeBps: u256 = calldata.readU256();
        if (feeBps > MAX_PLATFORM_FEE_BPS) throw new Revert('Fee BPS exceeds maximum (1000)');

        const pullTokensFlag: bool = calldata.readBoolean();

        // Validate relationships
        if (softCapVal > hardCapVal) throw new Revert('Soft cap must be <= hard cap');
        if (startBlockVal >= endBlockVal) throw new Revert('Start must be before end');
        if (!minBuy.isZero() && minBuy > maxBuy) throw new Revert('Min must be <= max');

        // V2: Validate token amount covers hard cap at given rate
        const tokensNeeded: u256 = SafeMath.mul(hardCapVal, rate);
        if (tokenAmount < tokensNeeded) throw new Revert('Insufficient tokens for hard cap');

        // Store all parameters
        this.creator.value = creatorAddr;
        this.platformWallet.value = platformAddr;
        this.token.value = tokenAddr;
        this.hardCap.value = hardCapVal;
        this.softCap.value = softCapVal;
        this.tokenRate.value = rate;
        this.minContribution.value = minBuy;
        this.maxContribution.value = maxBuy;
        this.startBlock.value = startBlockVal;
        this.endBlock.value = endBlockVal;
        this.totalTokens.value = tokenAmount;
        this.platformFeeBps.value = feeBps.isZero() ? DEFAULT_PLATFORM_FEE_BPS : feeBps;
        this.initialized.value = true;

        // Pull tokens from caller if standalone deployment
        if (pullTokensFlag) {
            TransferHelper.transferFrom(
                tokenAddr,
                Blockchain.tx.sender,
                Blockchain.contract.address,
                tokenAmount,
            );
        }

        this.emitEvent(new PresaleCreatedEvent(creatorAddr, tokenAddr, hardCapVal, softCapVal));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Configure vesting for claimed tokens. Creator only, before presale starts.
     * V2: cliff and duration are in BLOCKS (not seconds).
     * @param cliffBlocks - blocks after presale end before vesting begins
     * @param durationBlocks - total vesting duration in blocks (after cliff)
     * @param tgeBps - percentage released at TGE in basis points (e.g. 2000 = 20%)
     */
    @method(
        { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        { name: 'tgeBps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setVesting(calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();
        this._requireNotStarted();

        const cliff: u256 = calldata.readU256();
        const duration: u256 = calldata.readU256();
        const tgeBps: u256 = calldata.readU256();

        if (duration.isZero()) throw new Revert('Duration must be > 0');
        if (tgeBps > BPS_DENOMINATOR) throw new Revert('TGE BPS must be <= 10000');

        this.vestingEnabled.value = true;
        this.vestingCliff.value = cliff;
        this.vestingDuration.value = duration;
        this.vestingTgeBps.value = tgeBps;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * V2: Configure anti-bot protection.
     * Limits the number of unique contributors per block.
     * Creator only, callable before presale starts.
     * @param maxPerBlock - max new contributors per block (0 = disabled)
     */
    @method({ name: 'maxPerBlock', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setAntiBot(calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();
        this._requireNotStarted();

        const maxPerBlock: u256 = calldata.readU256();
        this.antiBotMaxPerBlock.value = maxPerBlock;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── Whitelist ──

    /**
     * Enable whitelist — only whitelisted addresses can contribute.
     * Creator only, callable before presale starts.
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public enableWhitelist(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();
        this._requireNotStarted();

        this.whitelistEnabled.value = true;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Disable whitelist — anyone can contribute.
     * Creator only.
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public disableWhitelist(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();

        this.whitelistEnabled.value = false;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Add single address to whitelist. Creator only.
     */
    @method({ name: 'account', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public addToWhitelist(calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();

        const account: Address = calldata.readAddress();
        if (account.isZero()) throw new Revert('Invalid address');

        this.whitelist.set(account, u256.One);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * V2: Add batch of addresses to whitelist. Creator only.
     * Data is packed addresses: each 32 bytes = one Address.
     */
    @method({ name: 'data', type: ABIDataTypes.BYTES })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public addBatchToWhitelist(calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();

        const data: Uint8Array = calldata.readBytesWithLength();
        if (data.byteLength == 0) throw new Revert('Empty data');
        if (data.byteLength % ADDRESS_BYTE_LENGTH != 0) throw new Revert('Invalid data length');

        const count: u32 = data.byteLength / ADDRESS_BYTE_LENGTH;

        for (let i: u32 = 0; i < count; i++) {
            const offset: u32 = i * ADDRESS_BYTE_LENGTH;
            const slice: Uint8Array = data.slice(offset, offset + ADDRESS_BYTE_LENGTH);
            const addr: Address = changetype<Address>(slice);

            if (!addr.isZero()) {
                this.whitelist.set(addr, u256.One);
            }
        }

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count);
        return response;
    }

    /**
     * Remove address from whitelist. Creator only.
     */
    @method({ name: 'account', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public removeFromWhitelist(calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();

        const account: Address = calldata.readAddress();
        if (account.isZero()) throw new Revert('Invalid address');

        this.whitelist.set(account, u256.Zero);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── Core Lifecycle ──

    /**
     * Contribute to the presale. Records BTC contribution amount.
     * V2: Anti-bot check, contributor enumeration.
     */
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('Contributed')
    public contribute(calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._requireActive();
        this._requireNotFinalized();
        this._requireNotCancelled();
        this._requireNotPaused();

        const amount: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Whitelist check
        if (this.whitelistEnabled.value) {
            if (this.whitelist.get(sender).isZero()) {
                throw new Revert('Not whitelisted');
            }
        }

        if (amount < this.minContribution.value) throw new Revert('Below minimum contribution');

        const currentContribution: u256 = this.contributions.get(sender);
        const newContribution: u256 = SafeMath.add(currentContribution, amount);

        if (newContribution > this.maxContribution.value) throw new Revert('Exceeds maximum contribution');

        const newTotal: u256 = SafeMath.add(this.totalRaised.value, amount);
        if (newTotal > this.hardCap.value) throw new Revert('Exceeds hard cap');

        // V2: Anti-bot check — limit unique NEW contributors per block
        const isNewContributor: bool = currentContribution.isZero();
        if (isNewContributor) {
            const maxPerBlock: u256 = this.antiBotMaxPerBlock.value;
            if (!maxPerBlock.isZero()) {
                const currentBlockNum: u256 = u256.fromU64(Blockchain.block.number);
                const blockCount: u256 = this.blockContributorCount.get(currentBlockNum);
                if (blockCount >= maxPerBlock) throw new Revert('Max contributors per block reached');
                this.blockContributorCount.set(
                    currentBlockNum,
                    SafeMath.add(blockCount, u256.One),
                );
            }
        }

        // Effects (CEI pattern)
        this.contributions.set(sender, newContribution);
        this.totalRaised.value = newTotal;

        // V2: Add to contributor list if first contribution
        if (isNewContributor) {
            const idx: u256 = this.contributorCount.value;
            this.contributorList.set(idx, u256.fromUint8ArrayBE(sender));
            this.contributorIndex.set(sender, SafeMath.add(idx, u256.One)); // 1-indexed
            this.contributorCount.value = SafeMath.add(idx, u256.One);
        }

        this.emitEvent(new ContributedEvent(sender, amount));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Claim tokens after presale ends and soft cap is met.
     * With vesting: returns currently claimable portion. Can be called multiple times.
     * Without vesting: returns full allocation on first call.
     * V2: Vesting uses block numbers.
     */
    @method()
    @returns({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    @emit('Claimed')
    public claim(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._requireNotCancelled();
        this._requireEnded();
        this._requireSoftCapMet();

        const sender: Address = Blockchain.tx.sender;

        const contribution: u256 = this.contributions.get(sender);
        if (contribution.isZero()) throw new Revert('No contribution');

        const totalClaimable: u256 = this._calculateClaimable(contribution);
        const alreadyClaimed: u256 = this.claimed.get(sender);

        if (totalClaimable <= alreadyClaimed) throw new Revert('Nothing to claim');

        const claimAmount: u256 = SafeMath.sub(totalClaimable, alreadyClaimed);

        // Effects first (CEI pattern)
        this.claimed.set(sender, totalClaimable);

        // Transfer tokens
        TransferHelper.transfer(this.token.value, sender, claimAmount);

        this.emitEvent(new ClaimedEvent(sender, claimAmount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(claimAmount);
        return response;
    }

    /**
     * Finalize presale after end block, when soft cap is met.
     * Deducts platform fee, returns excess tokens to creator.
     * Creator only.
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('Finalized')
    public finalize(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._requireEnded();
        this._requireNotCancelled();
        this._onlyCreator();

        if (this.finalized.value) throw new Revert('Already finalized');
        if (this.totalRaised.value < this.softCap.value) throw new Revert('Soft cap not met');

        this.finalized.value = true;

        const totalTokensAvailable: u256 = this.totalTokens.value;
        const tokensSold: u256 = SafeMath.mul(this.totalRaised.value, this.tokenRate.value);

        // V2: Configurable platform fee
        const feeBps: u256 = this.platformFeeBps.value;
        const platformFee: u256 = SafeMath.div(
            SafeMath.mul(tokensSold, feeBps),
            BPS_DENOMINATOR,
        );

        if (!platformFee.isZero()) {
            this.platformFeeCollected.value = platformFee;
            TransferHelper.transfer(this.token.value, this.platformWallet.value, platformFee);
        }

        // Return excess tokens (total - sold - fee) to creator
        const tokensUsed: u256 = SafeMath.add(tokensSold, platformFee);
        if (tokensUsed < totalTokensAvailable) {
            const excess: u256 = SafeMath.sub(totalTokensAvailable, tokensUsed);
            TransferHelper.transfer(this.token.value, this.creator.value, excess);
        }

        this.emitEvent(new FinalizedEvent(this.totalRaised.value, platformFee));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Refund — return all tokens to creator when soft cap is NOT met.
     * Only after presale ends. Creator only.
     */
    @method()
    @returns({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    @emit('Refunded')
    public refund(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._requireEnded();
        this._requireNotFinalized();
        this._requireNotCancelled();
        this._onlyCreator();

        if (this.totalRaised.value >= this.softCap.value) {
            throw new Revert('Soft cap met, use finalize');
        }

        const tokensToReturn: u256 = this.totalTokens.value;
        this.cancelled.value = true;

        TransferHelper.transfer(this.token.value, this.creator.value, tokensToReturn);

        this.emitEvent(new RefundedEvent(this.creator.value, tokensToReturn));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(tokensToReturn);
        return response;
    }

    /**
     * Emergency withdraw — cancel presale and return all tokens to creator.
     * Can be called at any time (before or during presale). Creator only.
     */
    @method()
    @returns({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    @emit('PresaleCancelled')
    public emergencyWithdraw(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._requireNotFinalized();
        this._requireNotCancelled();
        this._onlyCreator();

        const tokensToReturn: u256 = this.totalTokens.value;
        this.cancelled.value = true;

        TransferHelper.transfer(this.token.value, this.creator.value, tokensToReturn);

        this.emitEvent(new CancelledEvent(this.creator.value, tokensToReturn));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(tokensToReturn);
        return response;
    }

    // ── Pause ──

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('PresalePaused')
    public pause(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();
        if (this.paused.value) throw new Revert('Already paused');

        this.paused.value = true;
        this.emitEvent(new PausedEvent(Blockchain.tx.sender));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('PresaleUnpaused')
    public unpause(_calldata: Calldata): BytesWriter {
        this._requireInitialized();
        this._onlyCreator();
        if (!this.paused.value) throw new Revert('Not paused');

        this.paused.value = false;
        this.emitEvent(new UnpausedEvent(Blockchain.tx.sender));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── OP20 Receive Callback ──

    @method(
        { name: 'operator', type: ABIDataTypes.ADDRESS },
        { name: 'from', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'data', type: ABIDataTypes.BYTES },
    )
    @returns({ name: 'selector', type: ABIDataTypes.BYTES4 })
    public onOP20Received(calldata: Calldata): BytesWriter {
        calldata.readAddress(); // operator
        calldata.readAddress(); // from
        calldata.readU256();    // amount
        calldata.readBytesWithLength(); // data

        const response: BytesWriter = new BytesWriter(4);
        response.writeSelector(ON_OP20_RECEIVED_SELECTOR);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ VIEW METHODS
    // ══════════════════════════════════════════════════════════════

    @method()
    @returns(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'hardCap', type: ABIDataTypes.UINT256 },
        { name: 'softCap', type: ABIDataTypes.UINT256 },
        { name: 'totalRaised', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
    )
    public getPresaleInfo(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 5,
        );
        response.writeAddress(this.token.value);
        response.writeAddress(this.creator.value);
        response.writeU256(this.hardCap.value);
        response.writeU256(this.softCap.value);
        response.writeU256(this.totalRaised.value);
        response.writeU256(this.startBlock.value);
        response.writeU256(this.endBlock.value);
        return response;
    }

    @method({ name: 'contributor', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'contribution', type: ABIDataTypes.UINT256 })
    public getContribution(calldata: Calldata): BytesWriter {
        const contributor: Address = calldata.readAddress();
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.contributions.get(contributor));
        return response;
    }

    @method({ name: 'contributor', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'claimable', type: ABIDataTypes.UINT256 })
    public getClaimable(calldata: Calldata): BytesWriter {
        const contributor: Address = calldata.readAddress();
        const contribution: u256 = this.contributions.get(contributor);

        let claimable: u256 = u256.Zero;
        if (!contribution.isZero()) {
            const totalVested: u256 = this._calculateClaimable(contribution);
            const alreadyClaimed: u256 = this.claimed.get(contributor);
            if (totalVested > alreadyClaimed) {
                claimable = SafeMath.sub(totalVested, alreadyClaimed);
            }
        }

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(claimable);
        return response;
    }

    @method()
    @returns({ name: 'rate', type: ABIDataTypes.UINT256 })
    public getRate(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.tokenRate.value);
        return response;
    }

    @method()
    @returns({ name: 'platformFee', type: ABIDataTypes.UINT256 })
    public getPlatformFee(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.platformFeeCollected.value);
        return response;
    }

    @method()
    @returns({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    public getPlatformFeeBps(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.platformFeeBps.value);
        return response;
    }

    /**
     * V2: Check if presale is active using block numbers.
     */
    @method()
    @returns({ name: 'active', type: ABIDataTypes.BOOL })
    public isActive(_calldata: Calldata): BytesWriter {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const active: bool = currentBlock >= this.startBlock.value
            && currentBlock <= this.endBlock.value
            && !this.paused.value
            && !this.cancelled.value;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(active);
        return response;
    }

    @method()
    @returns({ name: 'met', type: ABIDataTypes.BOOL })
    public isSoftCapMet(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.totalRaised.value >= this.softCap.value);
        return response;
    }

    @method({ name: 'account', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'whitelisted', type: ABIDataTypes.BOOL })
    public isWhitelisted(calldata: Calldata): BytesWriter {
        const account: Address = calldata.readAddress();
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(!this.whitelist.get(account).isZero());
        return response;
    }

    @method()
    @returns(
        { name: 'enabled', type: ABIDataTypes.BOOL },
        { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        { name: 'tgeBps', type: ABIDataTypes.UINT256 },
    )
    public getVestingInfo(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1 + U256_BYTE_LENGTH * 3);
        response.writeBoolean(this.vestingEnabled.value);
        response.writeU256(this.vestingCliff.value);
        response.writeU256(this.vestingDuration.value);
        response.writeU256(this.vestingTgeBps.value);
        return response;
    }

    @method()
    @returns({ name: 'paused', type: ABIDataTypes.BOOL })
    public isPaused(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.paused.value);
        return response;
    }

    @method()
    @returns({ name: 'cancelled', type: ABIDataTypes.BOOL })
    public isCancelled(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.cancelled.value);
        return response;
    }

    @method()
    @returns({ name: 'finalized', type: ABIDataTypes.BOOL })
    public isFinalized(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.finalized.value);
        return response;
    }

    // ── V2: Contributor Enumeration ──

    /**
     * V2: Get total unique contributor count.
     */
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getContributorCount(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(this.contributorCount.value.toU32());
        return response;
    }

    /**
     * V2: Get contributor address by index.
     */
    @method({ name: 'index', type: ABIDataTypes.UINT32 })
    @returns(
        { name: 'contributor', type: ABIDataTypes.ADDRESS },
        { name: 'contribution', type: ABIDataTypes.UINT256 },
    )
    public getContributorByIndex(calldata: Calldata): BytesWriter {
        const index: u32 = calldata.readU32();
        const indexU256: u256 = u256.fromU32(index);

        if (indexU256 >= this.contributorCount.value) {
            throw new Revert('Index out of bounds');
        }

        const contributorU256: u256 = this.contributorList.get(indexU256);
        const contributor: Address = changetype<Address>(contributorU256.toUint8Array(true));
        const contribution: u256 = this.contributions.get(contributor);

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
        response.writeAddress(contributor);
        response.writeU256(contribution);
        return response;
    }

    /**
     * V2: Get anti-bot configuration.
     */
    @method()
    @returns({ name: 'maxPerBlock', type: ABIDataTypes.UINT256 })
    public getAntiBotConfig(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.antiBotMaxPerBlock.value);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════

    private _onlyCreator(): void {
        if (!Blockchain.tx.sender.equals(this.creator.value)) {
            throw new Revert('Only creator');
        }
    }

    private _requireInitialized(): void {
        if (!this.initialized.value) throw new Revert('Not initialized');
    }

    /**
     * V2: Block-based active check.
     */
    private _requireActive(): void {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (currentBlock < this.startBlock.value) throw new Revert('Presale not started');
        if (currentBlock > this.endBlock.value) throw new Revert('Presale ended');
    }

    /**
     * V2: Block-based ended check.
     */
    private _requireEnded(): void {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (currentBlock <= this.endBlock.value) throw new Revert('Presale not ended');
    }

    /**
     * V2: Block-based not-started check.
     */
    private _requireNotStarted(): void {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        if (currentBlock >= this.startBlock.value) throw new Revert('Presale already started');
    }

    private _requireNotFinalized(): void {
        if (this.finalized.value) throw new Revert('Already finalized');
    }

    private _requireNotCancelled(): void {
        if (this.cancelled.value) throw new Revert('Presale cancelled');
    }

    private _requireNotPaused(): void {
        if (this.paused.value) throw new Revert('Presale paused');
    }

    private _requireSoftCapMet(): void {
        if (this.totalRaised.value < this.softCap.value) throw new Revert('Soft cap not met');
    }

    /**
     * Calculate how many tokens are claimable based on contribution and vesting.
     * V2: Uses block numbers for all timing calculations.
     *
     * Without vesting: returns full allocation (contribution * rate).
     * With vesting: returns vested amount based on TGE + cliff + linear schedule.
     */
    private _calculateClaimable(contribution: u256): u256 {
        const totalAllocation: u256 = SafeMath.mul(contribution, this.tokenRate.value);

        if (!this.vestingEnabled.value) {
            return totalAllocation;
        }

        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const presaleEndBlock: u256 = this.endBlock.value;

        // TGE release (immediate portion)
        const tgeAmount: u256 = SafeMath.div(
            SafeMath.mul(totalAllocation, this.vestingTgeBps.value),
            BPS_DENOMINATOR,
        );

        // Before presale end (safety check)
        if (currentBlock <= presaleEndBlock) return u256.Zero;

        // During cliff — only TGE portion available
        const cliffEndBlock: u256 = SafeMath.add(presaleEndBlock, this.vestingCliff.value);
        if (currentBlock < cliffEndBlock) return tgeAmount;

        // After full vesting — everything available
        const vestingEndBlock: u256 = SafeMath.add(cliffEndBlock, this.vestingDuration.value);
        if (currentBlock >= vestingEndBlock) return totalAllocation;

        // During linear vesting period
        const vestingAmount: u256 = SafeMath.sub(totalAllocation, tgeAmount);
        const elapsed: u256 = SafeMath.sub(currentBlock, cliffEndBlock);
        const vestedPortion: u256 = SafeMath.div(
            SafeMath.mul(vestingAmount, elapsed),
            this.vestingDuration.value,
        );

        return SafeMath.add(tgeAmount, vestedPortion);
    }
}
