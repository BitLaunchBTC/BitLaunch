// BitLaunch Presale Factory V2
// Deploys presale instances from a template using the two-step pattern:
//   1. Clone template via Blockchain.deployContractFromExisting()
//   2. Transfer tokens from creator to clone
//   3. Initialize the clone via Blockchain.call()
//
// V2 Changes:
//   - Multi-presale per creator (no overwrite on 2nd presale)
//   - Reentrancy guard on createPresale
//   - Configurable default platform fee BPS
//   - Factory ownership transfer
//   - Block-based timing (startBlock/endBlock instead of timestamps)
//   - Updated initialize selector to match PresaleContract V2 (13 params)

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    AddressMemoryMap,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
    StoredAddress,
    StoredBoolean,
    StoredU256,
    StoredMapU256,
    U256_BYTE_LENGTH,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';

import { encodeSelector } from '@btc-vision/btc-runtime/runtime/math/abi';
import { ON_OP20_RECEIVED_SELECTOR } from '@btc-vision/btc-runtime/runtime/constants/Exports';

// V3: Updated selector for PresaleContract V3's 17-param initialize (added vesting + anti-bot)
const PRESALE_INITIALIZE_SELECTOR: u32 = encodeSelector(
    'initialize(address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256)',
);

// Default platform fee: 200 BPS = 2%
const DEFAULT_FEE_BPS: u256 = u256.fromU32(200);

// ── Storage Pointers ──
const OWNER_POINTER: u16 = Blockchain.nextPointer;
const TEMPLATE_POINTER: u16 = Blockchain.nextPointer;
const PLATFORM_WALLET_POINTER: u16 = Blockchain.nextPointer;
const PAUSED_POINTER: u16 = Blockchain.nextPointer;
const REENTRANCY_POINTER: u16 = Blockchain.nextPointer;           // V2
const DEFAULT_FEE_BPS_POINTER: u16 = Blockchain.nextPointer;      // V2
const PRESALE_COUNT_POINTER: u16 = Blockchain.nextPointer;
const PRESALES_MAP_POINTER: u16 = Blockchain.nextPointer;         // globalIndex → presale (u256)
const PRESALE_CREATORS_POINTER: u16 = Blockchain.nextPointer;     // presale → creator (u256)
const PRESALE_TOKENS_POINTER: u16 = Blockchain.nextPointer;       // presale → token (u256)
const PRESALE_DEPLOY_BLOCK_POINTER: u16 = Blockchain.nextPointer; // V2: presale → block (u256)
const CREATOR_PRESALE_COUNT_POINTER: u16 = Blockchain.nextPointer; // V2: creator → count (u256)

// ── Events ──

@final
class PresaleDeployedEvent extends NetEvent {
    constructor(creator: Address, presale: Address, token: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 3);
        data.writeAddress(creator);
        data.writeAddress(presale);
        data.writeAddress(token);
        super('PresaleDeployed', data);
    }
}

@final
class FactoryPausedEvent extends NetEvent {
    constructor(by: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(by);
        super('FactoryPaused', data);
    }
}

@final
class FactoryUnpausedEvent extends NetEvent {
    constructor(by: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(by);
        super('FactoryUnpaused', data);
    }
}

@final
class OwnershipTransferredEvent extends NetEvent {
    constructor(previousOwner: Address, newOwner: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        data.writeAddress(previousOwner);
        data.writeAddress(newOwner);
        super('OwnershipTransferred', data);
    }
}

// ── Contract ──

@final
export class PresaleFactory extends OP_NET {
    private readonly factoryOwner: StoredAddress;
    private readonly template: StoredAddress;
    private readonly platformWallet: StoredAddress;
    private readonly paused: StoredBoolean;
    private readonly reentrancyLock: StoredBoolean;                // V2
    private readonly defaultFeeBps: StoredU256;                    // V2
    private readonly presaleCount: StoredU256;
    private readonly presales: StoredMapU256;                      // index → presale (u256)
    private readonly presaleCreators: AddressMemoryMap;            // presale → creator (u256)
    private readonly presaleTokens: AddressMemoryMap;              // presale → token (u256)
    private readonly presaleDeployBlock: AddressMemoryMap;         // V2: presale → block (u256)
    private readonly creatorPresaleCount: AddressMemoryMap;        // V2: creator → count (u256)

    public constructor() {
        super();

        this.factoryOwner = new StoredAddress(OWNER_POINTER);
        this.template = new StoredAddress(TEMPLATE_POINTER);
        this.platformWallet = new StoredAddress(PLATFORM_WALLET_POINTER);
        this.paused = new StoredBoolean(PAUSED_POINTER, false);
        this.reentrancyLock = new StoredBoolean(REENTRANCY_POINTER, false);
        this.defaultFeeBps = new StoredU256(DEFAULT_FEE_BPS_POINTER, EMPTY_POINTER);
        this.presaleCount = new StoredU256(PRESALE_COUNT_POINTER, EMPTY_POINTER);
        this.presales = new StoredMapU256(PRESALES_MAP_POINTER);
        this.presaleCreators = new AddressMemoryMap(PRESALE_CREATORS_POINTER);
        this.presaleTokens = new AddressMemoryMap(PRESALE_TOKENS_POINTER);
        this.presaleDeployBlock = new AddressMemoryMap(PRESALE_DEPLOY_BLOCK_POINTER);
        this.creatorPresaleCount = new AddressMemoryMap(CREATOR_PRESALE_COUNT_POINTER);
    }

    /**
     * Initialize factory on deployment.
     * Owner = tx.origin. Template + platformWallet from calldata (optional).
     */
    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        this.factoryOwner.value = Blockchain.tx.origin;

        // V2: Set default fee BPS
        this.defaultFeeBps.value = DEFAULT_FEE_BPS;

        // Try to read template from calldata (may be 0 bytes on regtest)
        const remaining: i32 = calldata.byteLength - calldata.getOffset();
        if (remaining >= ADDRESS_BYTE_LENGTH) {
            const templateAddr: Address = calldata.readAddress();
            if (!templateAddr.isZero()) {
                this.template.value = templateAddr;
            }
        }

        const remaining2: i32 = calldata.byteLength - calldata.getOffset();
        if (remaining2 >= ADDRESS_BYTE_LENGTH) {
            const platformAddr: Address = calldata.readAddress();
            if (!platformAddr.isZero()) {
                this.platformWallet.value = platformAddr;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    // ██ WRITE METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Deploy a new presale from the template.
     * V2: Block-based timing, multi-presale per creator, reentrancy guard.
     * Caller must have approved this factory to spend their tokens first.
     * Flow: deploy clone → transfer tokens → initialize clone
     */
    @method(
        { name: 'tokenAddr', type: ABIDataTypes.ADDRESS },
        { name: 'hardCap', type: ABIDataTypes.UINT256 },
        { name: 'softCap', type: ABIDataTypes.UINT256 },
        { name: 'rate', type: ABIDataTypes.UINT256 },
        { name: 'minBuy', type: ABIDataTypes.UINT256 },
        { name: 'maxBuy', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
        { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
        { name: 'vestingCliff', type: ABIDataTypes.UINT256 },
        { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
        { name: 'vestingTgeBps', type: ABIDataTypes.UINT256 },
        { name: 'antiBotMaxPerBlock', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'presaleAddress', type: ABIDataTypes.ADDRESS })
    @emit('PresaleDeployed')
    public createPresale(calldata: Calldata): BytesWriter {
        if (this.paused.value) throw new Revert('Factory is paused');

        // V2: Reentrancy guard
        this._nonReentrant();

        const tokenAddr: Address = calldata.readAddress();
        if (tokenAddr.isZero()) throw new Revert('Invalid token address');

        const hardCap: u256 = calldata.readU256();
        if (hardCap.isZero()) throw new Revert('Hard cap must be > 0');

        const softCap: u256 = calldata.readU256();

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

        // V3: Read optional vesting + anti-bot params
        const vestingCliff: u256 = calldata.readU256();
        const vestingDuration: u256 = calldata.readU256();
        const vestingTgeBps: u256 = calldata.readU256();
        const antiBotMaxPerBlock: u256 = calldata.readU256();

        // Validate relationships
        if (softCap > hardCap) throw new Revert('Soft cap must be <= hard cap');
        if (startBlockVal >= endBlockVal) throw new Revert('Start must be before end');
        if (!minBuy.isZero() && minBuy > maxBuy) throw new Revert('Min must be <= max buy');

        const templateAddr: Address = this.template.value;
        if (templateAddr.isZero()) throw new Revert('Template not set');

        const platformAddr: Address = this.platformWallet.value;
        if (platformAddr.isZero()) throw new Revert('Platform wallet not set');

        const creator: Address = Blockchain.tx.origin;
        const globalIndex: u256 = this.presaleCount.value;
        const salt: u256 = SafeMath.add(globalIndex, u256.One);

        // ── Step 1: Deploy clone with empty calldata ──
        const presaleAddr: Address = Blockchain.deployContractFromExisting(
            templateAddr,
            salt,
            new BytesWriter(0),
        );
        if (presaleAddr.isZero()) throw new Revert('Deployment failed');

        // ── Step 2: Transfer tokens from creator to presale clone ──
        TransferHelper.transferFrom(tokenAddr, creator, presaleAddr, tokenAmount);

        // ── Step 3: Initialize the presale clone (V3: 17-param signature) ──
        const initCalldataSize: u32 =
            4 +                          // selector
            ADDRESS_BYTE_LENGTH * 3 +    // creator, platformWallet, token
            U256_BYTE_LENGTH * 13 +      // 9 original + 4 new (vestingCliff, vestingDuration, vestingTgeBps, antiBotMaxPerBlock)
            1;                           // pullTokens (bool)

        const initCalldata: BytesWriter = new BytesWriter(initCalldataSize);
        initCalldata.writeSelector(PRESALE_INITIALIZE_SELECTOR);
        initCalldata.writeAddress(creator);           // creator
        initCalldata.writeAddress(platformAddr);      // platformWallet
        initCalldata.writeAddress(tokenAddr);         // token
        initCalldata.writeU256(hardCap);
        initCalldata.writeU256(softCap);
        initCalldata.writeU256(rate);
        initCalldata.writeU256(minBuy);
        initCalldata.writeU256(maxBuy);
        initCalldata.writeU256(startBlockVal);        // V2: block number
        initCalldata.writeU256(endBlockVal);          // V2: block number
        initCalldata.writeU256(tokenAmount);
        initCalldata.writeU256(this.defaultFeeBps.value); // V2: configurable fee
        initCalldata.writeBoolean(false);             // pullTokens = false (already transferred)
        initCalldata.writeU256(vestingCliff);           // V3: vesting cliff blocks (0 = disabled)
        initCalldata.writeU256(vestingDuration);        // V3: vesting duration blocks (0 = disabled)
        initCalldata.writeU256(vestingTgeBps);          // V3: TGE unlock % in BPS (0 = no TGE)
        initCalldata.writeU256(antiBotMaxPerBlock);     // V3: max contributors per block (0 = disabled)

        Blockchain.call(presaleAddr, initCalldata);

        // ── Store deployment info ──
        this.presales.set(globalIndex, this._u256FromAddress(presaleAddr));
        this.presaleCreators.set(presaleAddr, this._u256FromAddress(creator));
        this.presaleTokens.set(presaleAddr, this._u256FromAddress(tokenAddr));
        this.presaleDeployBlock.set(presaleAddr, u256.fromU64(Blockchain.block.number));
        this.presaleCount.value = SafeMath.add(globalIndex, u256.One);

        // V2: Increment creator's presale count
        const currentCount: u256 = this.creatorPresaleCount.get(creator);
        this.creatorPresaleCount.set(creator, SafeMath.add(currentCount, u256.One));

        this.emitEvent(new PresaleDeployedEvent(creator, presaleAddr, tokenAddr));

        // V2: Release reentrancy lock
        this._endNonReentrant();

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(presaleAddr);
        return response;
    }

    // ── Pause ──

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('FactoryPaused')
    public pauseFactory(_: Calldata): BytesWriter {
        this._onlyOwner();
        if (this.paused.value) throw new Revert('Already paused');

        this.paused.value = true;
        this.emitEvent(new FactoryPausedEvent(Blockchain.tx.sender));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('FactoryUnpaused')
    public unpauseFactory(_: Calldata): BytesWriter {
        this._onlyOwner();
        if (!this.paused.value) throw new Revert('Not paused');

        this.paused.value = false;
        this.emitEvent(new FactoryUnpausedEvent(Blockchain.tx.sender));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── Owner & Config ──

    @method()
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public owner(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.factoryOwner.value);
        return response;
    }

    /**
     * V2: Transfer factory ownership.
     */
    @method({ name: 'newOwner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OwnershipTransferred')
    public transferOwnership(calldata: Calldata): BytesWriter {
        this._onlyOwner();

        const newOwner: Address = calldata.readAddress();
        if (newOwner.isZero()) throw new Revert('Invalid new owner');

        const previousOwner: Address = this.factoryOwner.value;
        this.factoryOwner.value = newOwner;

        this.emitEvent(new OwnershipTransferredEvent(previousOwner, newOwner));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    @method({ name: 'newTemplate', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setTemplate(calldata: Calldata): BytesWriter {
        this._onlyOwner();
        const newTemplate: Address = calldata.readAddress();
        if (newTemplate.isZero()) throw new Revert('Invalid template');

        this.template.value = newTemplate;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    @method({ name: 'newPlatformWallet', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setPlatformWallet(calldata: Calldata): BytesWriter {
        this._onlyOwner();
        const newWallet: Address = calldata.readAddress();
        if (newWallet.isZero()) throw new Revert('Invalid wallet');

        this.platformWallet.value = newWallet;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * V2: Set default platform fee BPS for new presales.
     */
    @method({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setDefaultFeeBps(calldata: Calldata): BytesWriter {
        this._onlyOwner();

        const feeBps: u256 = calldata.readU256();
        if (feeBps > u256.fromU32(1000)) throw new Revert('Fee BPS exceeds maximum (1000)');

        this.defaultFeeBps.value = feeBps;

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ READ METHODS
    // ══════════════════════════════════════════════════════════════

    @method()
    @returns({ name: 'isPaused', type: ABIDataTypes.BOOL })
    public isPaused(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.paused.value);
        return response;
    }

    @method()
    @returns({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    public getDefaultFeeBps(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.defaultFeeBps.value);
        return response;
    }

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getPresaleCount(_: Calldata): BytesWriter {
        const count: u256 = this.presaleCount.value;
        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    @method({ name: 'index', type: ABIDataTypes.UINT32 })
    @returns(
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'presale', type: ABIDataTypes.ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
    )
    public getPresaleByIndex(calldata: Calldata): BytesWriter {
        const index: u32 = calldata.readU32();
        const indexU256: u256 = u256.fromU32(index);

        if (indexU256 >= this.presaleCount.value) {
            throw new Revert('Index out of bounds');
        }

        const presaleU256: u256 = this.presales.get(indexU256);
        const presaleAddr: Address = this._addressFromU256(presaleU256);
        const creatorU256: u256 = this.presaleCreators.get(presaleAddr);
        const creator: Address = this._addressFromU256(creatorU256);
        const tokenU256: u256 = this.presaleTokens.get(presaleAddr);
        const tokenAddr: Address = this._addressFromU256(tokenU256);

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 3);
        response.writeAddress(creator);
        response.writeAddress(presaleAddr);
        response.writeAddress(tokenAddr);
        return response;
    }

    @method({ name: 'presaleAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'creator', type: ABIDataTypes.ADDRESS })
    public getPresaleCreator(calldata: Calldata): BytesWriter {
        const presaleAddr: Address = calldata.readAddress();
        const creatorU256: u256 = this.presaleCreators.get(presaleAddr);
        const creator: Address = this._addressFromU256(creatorU256);

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(creator);
        return response;
    }

    // ── V2: Per-Creator Multi-Presale Queries ──

    /**
     * V2: Get how many presales a creator has deployed.
     */
    @method({ name: 'creator', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getCreatorPresaleCount(calldata: Calldata): BytesWriter {
        const creator: Address = calldata.readAddress();
        const count: u256 = this.creatorPresaleCount.get(creator);

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * V2: Get a creator's presale by local index.
     * Iterates the global list for the Nth match.
     */
    @method(
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT32 },
    )
    @returns(
        { name: 'presale', type: ABIDataTypes.ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'block', type: ABIDataTypes.UINT64 },
    )
    public getCreatorPresaleByIndex(calldata: Calldata): BytesWriter {
        const creator: Address = calldata.readAddress();
        const targetIndex: u32 = calldata.readU32();

        const creatorCount: u256 = this.creatorPresaleCount.get(creator);
        if (u256.fromU32(targetIndex) >= creatorCount) {
            throw new Revert('Index out of bounds');
        }

        // Iterate global presales, find Nth match for this creator
        const total: u32 = this.presaleCount.value.toU32();
        let matched: u32 = 0;

        for (let i: u32 = 0; i < total; i++) {
            const presaleU256: u256 = this.presales.get(u256.fromU32(i));
            const presaleAddr: Address = this._addressFromU256(presaleU256);
            const presaleCreatorU256: u256 = this.presaleCreators.get(presaleAddr);
            const presaleCreator: Address = this._addressFromU256(presaleCreatorU256);

            if (presaleCreator.equals(creator)) {
                if (matched == targetIndex) {
                    const tokenU256: u256 = this.presaleTokens.get(presaleAddr);
                    const tokenAddr: Address = this._addressFromU256(tokenU256);
                    const blockNum: u256 = this.presaleDeployBlock.get(presaleAddr);

                    const response: BytesWriter = new BytesWriter(
                        ADDRESS_BYTE_LENGTH * 2 + 8,
                    );
                    response.writeAddress(presaleAddr);
                    response.writeAddress(tokenAddr);
                    response.writeU64(blockNum.toU64());
                    return response;
                }
                matched++;
            }
        }

        throw new Revert('Presale not found');
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
        calldata.readAddress();
        calldata.readAddress();
        calldata.readU256();
        calldata.readBytesWithLength();

        const response: BytesWriter = new BytesWriter(4);
        response.writeSelector(ON_OP20_RECEIVED_SELECTOR);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██ INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════

    private _onlyOwner(): void {
        if (!this.factoryOwner.value.equals(Blockchain.tx.sender)) {
            throw new Revert('Only factory owner');
        }
    }

    private _nonReentrant(): void {
        if (this.reentrancyLock.value) throw new Revert('Reentrancy detected');
        this.reentrancyLock.value = true;
    }

    private _endNonReentrant(): void {
        this.reentrancyLock.value = false;
    }

    private _u256FromAddress(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private _addressFromU256(val: u256): Address {
        return changetype<Address>(val.toUint8Array(true));
    }
}
