// OP20 Factory Contract V2
// Deploys new OP20 tokens using the two-step pattern:
//   1. Clone template via Blockchain.deployContractFromExisting() with empty calldata
//   2. Initialize the clone via Blockchain.call() with ABI-encoded initialize() selector
//
// V2 Changes:
//   - Multi-token per deployer (no more overwrite on 2nd deploy)
//   - Reentrancy guard on deployToken
//   - Factory ownership transfer
//   - Per-token block tracking (not per-deployer)
//   - Updated deployToken: 11 params matching OP20Template V2's initialize()
//     (adds freeMintUserCap, burnEnabled)

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
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
    AddressMemoryMap,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

import { encodeSelector } from '@btc-vision/btc-runtime/runtime/math/abi';
import { ON_OP20_RECEIVED_SELECTOR } from '@btc-vision/btc-runtime/runtime/constants/Exports';

// V2: Updated selector for 11-param initialize matching OP20Template V2
const INITIALIZE_SELECTOR: u32 = encodeSelector(
    'initialize(uint256,uint8,string,string,address,uint256,uint256,uint256,uint256,address,bool)',
);

// ── Storage Pointers ──
const OWNER_POINTER: u16 = Blockchain.nextPointer;
const TEMPLATE_POINTER: u16 = Blockchain.nextPointer;
const PAUSED_POINTER: u16 = Blockchain.nextPointer;
const REENTRANCY_POINTER: u16 = Blockchain.nextPointer;          // V2: reentrancy guard
const DEPLOYMENT_COUNT_POINTER: u16 = Blockchain.nextPointer;
const GLOBAL_TOKENS_MAP_POINTER: u16 = Blockchain.nextPointer;   // globalIndex → token (u256)
const TOKEN_DEPLOYERS_POINTER: u16 = Blockchain.nextPointer;     // token → deployer (u256)
const TOKEN_OWNERS_POINTER: u16 = Blockchain.nextPointer;        // token → owner (u256)
const TOKEN_DEPLOY_BLOCK_POINTER: u16 = Blockchain.nextPointer;  // V2: token → block (u256)
const DEPLOYER_TOKEN_COUNT_POINTER: u16 = Blockchain.nextPointer; // V2: deployer → count (u256)

// ── Events ──

@final
class TokenDeployedEvent extends NetEvent {
    constructor(deployer: Address, tokenAddress: Address, name: string, symbol: string) {
        const nameBytes: ArrayBuffer = String.UTF8.encode(name);
        const symbolBytes: ArrayBuffer = String.UTF8.encode(symbol);
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 +
                4 + <u32>nameBytes.byteLength +
                4 + <u32>symbolBytes.byteLength,
        );
        data.writeAddress(deployer);
        data.writeAddress(tokenAddress);
        data.writeStringWithLength(name);
        data.writeStringWithLength(symbol);
        super('TokenDeployed', data);
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
export class OP20Factory extends OP_NET {
    // Storage
    private readonly factoryOwner: StoredAddress;
    private readonly template: StoredAddress;
    private readonly paused: StoredBoolean;
    private readonly reentrancyLock: StoredBoolean;                // V2
    private readonly deploymentCount: StoredU256;
    private readonly globalTokens: StoredMapU256;                  // globalIndex → tokenAsU256
    private readonly tokenDeployers: AddressMemoryMap;             // token → deployerAsU256
    private readonly tokenOwners: AddressMemoryMap;                // token → ownerAsU256
    private readonly tokenDeployBlock: AddressMemoryMap;           // V2: token → blockAsU256
    private readonly deployerTokenCount: AddressMemoryMap;         // V2: deployer → count

    public constructor() {
        super();

        this.factoryOwner = new StoredAddress(OWNER_POINTER);
        this.template = new StoredAddress(TEMPLATE_POINTER);
        this.paused = new StoredBoolean(PAUSED_POINTER, false);
        this.reentrancyLock = new StoredBoolean(REENTRANCY_POINTER, false);
        this.deploymentCount = new StoredU256(DEPLOYMENT_COUNT_POINTER, EMPTY_POINTER);
        this.globalTokens = new StoredMapU256(GLOBAL_TOKENS_MAP_POINTER);
        this.tokenDeployers = new AddressMemoryMap(TOKEN_DEPLOYERS_POINTER);
        this.tokenOwners = new AddressMemoryMap(TOKEN_OWNERS_POINTER);
        this.tokenDeployBlock = new AddressMemoryMap(TOKEN_DEPLOY_BLOCK_POINTER);
        this.deployerTokenCount = new AddressMemoryMap(DEPLOYER_TOKEN_COUNT_POINTER);
    }

    /**
     * Initialize factory on deployment.
     * Owner is always set to the deployer (tx.origin).
     * Calldata (template address) is optional — on regtest the node
     * may pass 0 bytes.  Use setTemplate() post-deploy.
     */
    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        // Owner is always the deployer
        this.factoryOwner.value = Blockchain.tx.origin;

        // Try to read template from calldata (may be 0 bytes on regtest)
        const remaining: i32 = calldata.byteLength - calldata.getOffset();
        if (remaining >= ADDRESS_BYTE_LENGTH) {
            const templateAddress: Address = calldata.readAddress();
            if (!templateAddress.isZero()) {
                this.template.value = templateAddress;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    // ██  WRITE METHODS
    // ══════════════════════════════════════════════════════════════

    /**
     * Deploy a new OP20 token from the template.
     * V2: 11 params matching OP20Template V2's initialize().
     * V2: Supports multi-token per deployer.
     * V2: Reentrancy guard protects external calls.
     */
    @method(
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
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('TokenDeployed')
    public deployToken(calldata: Calldata): BytesWriter {
        if (this.paused.value) throw new Revert('Factory is paused');

        // V2: Reentrancy guard
        this._nonReentrant();

        // ── Read all 11 params ──
        const maxSupply: u256 = calldata.readU256();
        if (maxSupply.isZero()) throw new Revert('Max supply must be > 0');

        const decimals: u8 = calldata.readU8();
        if (decimals > 18) throw new Revert('Decimals must be 0-18');

        const name: string = calldata.readStringWithLength();
        if (name.length == 0 || name.length > 50) throw new Revert('Name must be 1-50 chars');

        const symbol: string = calldata.readStringWithLength();
        if (symbol.length == 0 || symbol.length > 10) throw new Revert('Symbol must be 1-10 chars');

        const initialMintTo: Address = calldata.readAddress();
        const initialMintAmount: u256 = calldata.readU256();
        const freeMintSupply: u256 = calldata.readU256();
        const freeMintPerTx: u256 = calldata.readU256();
        const freeMintUserCap: u256 = calldata.readU256(); // V2
        const tokenOwner: Address = calldata.readAddress();
        const burnEnabled: bool = calldata.readBoolean(); // V2

        if (tokenOwner.isZero()) throw new Revert('Invalid token owner');
        if (initialMintAmount > maxSupply) throw new Revert('Initial mint exceeds max supply');

        // Generate deterministic salt from global deployment count
        const globalIndex: u256 = this.deploymentCount.value;
        const salt: u256 = SafeMath.add(globalIndex, u256.One);

        // Verify template is set
        const templateAddr: Address = this.template.value;
        if (templateAddr.isZero()) throw new Revert('Template not set');

        // ── Step 1: Deploy clone with EMPTY calldata ──
        const tokenAddress: Address = Blockchain.deployContractFromExisting(
            templateAddr,
            salt,
            new BytesWriter(0),
        );

        if (tokenAddress.isZero()) throw new Revert('Deployment failed');

        // ── Step 2: Call initialize() on the clone with all 11 params ──
        const nameBytes: ArrayBuffer = String.UTF8.encode(name);
        const symbolBytes: ArrayBuffer = String.UTF8.encode(symbol);
        const initCalldataSize: u32 =
            4 +                                  // selector
            U256_BYTE_LENGTH +                   // maxSupply
            1 +                                  // decimals
            4 + <u32>nameBytes.byteLength +      // name (length-prefixed)
            4 + <u32>symbolBytes.byteLength +    // symbol (length-prefixed)
            ADDRESS_BYTE_LENGTH +                // initialMintTo
            U256_BYTE_LENGTH +                   // initialMintAmount
            U256_BYTE_LENGTH +                   // freeMintSupply
            U256_BYTE_LENGTH +                   // freeMintPerTx
            U256_BYTE_LENGTH +                   // freeMintUserCap (V2)
            ADDRESS_BYTE_LENGTH +                // tokenOwner
            1;                                   // burnEnabled (V2)

        const initCalldata: BytesWriter = new BytesWriter(initCalldataSize);
        initCalldata.writeSelector(INITIALIZE_SELECTOR);
        initCalldata.writeU256(maxSupply);
        initCalldata.writeU8(decimals);
        initCalldata.writeStringWithLength(name);
        initCalldata.writeStringWithLength(symbol);
        initCalldata.writeAddress(initialMintTo);
        initCalldata.writeU256(initialMintAmount);
        initCalldata.writeU256(freeMintSupply);
        initCalldata.writeU256(freeMintPerTx);
        initCalldata.writeU256(freeMintUserCap);   // V2
        initCalldata.writeAddress(tokenOwner);
        initCalldata.writeBoolean(burnEnabled);     // V2

        // Call initialize on the clone — reverts on failure
        Blockchain.call(tokenAddress, initCalldata);

        // ── Store deployment info ──
        const deployer: Address = Blockchain.tx.origin;
        const blockNumber: u256 = u256.fromU64(Blockchain.block.number);

        // Store token at global index
        this.globalTokens.set(globalIndex, this._u256FromAddress(tokenAddress));
        this.deploymentCount.value = SafeMath.add(globalIndex, u256.One);

        // Store token → deployer and token → owner mappings
        this.tokenDeployers.set(tokenAddress, this._u256FromAddress(deployer));
        this.tokenOwners.set(tokenAddress, this._u256FromAddress(tokenOwner));

        // V2: Store token → block (per-token, not per-deployer)
        this.tokenDeployBlock.set(tokenAddress, blockNumber);

        // V2: Increment deployer's token count
        const currentCount: u256 = this.deployerTokenCount.get(deployer);
        this.deployerTokenCount.set(deployer, SafeMath.add(currentCount, u256.One));

        // Emit event
        this.emitEvent(new TokenDeployedEvent(deployer, tokenAddress, name, symbol));

        // V2: Release reentrancy lock
        this._endNonReentrant();

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
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

    /**
     * V2: Transfer factory ownership to a new address.
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

    /**
     * Update token owner in the factory's registry.
     * Only the current token owner can update.
     */
    @method(
        { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
        { name: 'newOwner', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public updateTokenOwner(calldata: Calldata): BytesWriter {
        const tokenAddress: Address = calldata.readAddress();
        const newOwner: Address = calldata.readAddress();

        if (newOwner.isZero()) throw new Revert('Invalid new owner');

        // Only current token owner can update
        const currentOwnerU256: u256 = this.tokenOwners.get(tokenAddress);
        const currentOwner: Address = this._addressFromU256(currentOwnerU256);
        if (!currentOwner.equals(Blockchain.tx.sender)) {
            throw new Revert('Only token owner can update');
        }

        this.tokenOwners.set(tokenAddress, this._u256FromAddress(newOwner));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ══════════════════════════════════════════════════════════════
    // ██  READ METHODS
    // ══════════════════════════════════════════════════════════════

    @method()
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public owner(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.factoryOwner.value);
        return response;
    }

    @method()
    @returns({ name: 'isPaused', type: ABIDataTypes.BOOL })
    public isPaused(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.paused.value);
        return response;
    }

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getDeploymentsCount(_: Calldata): BytesWriter {
        const count: u256 = this.deploymentCount.value;
        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * Get deployment info by global index.
     * V2: Block number is per-token (not per-deployer).
     */
    @method({ name: 'index', type: ABIDataTypes.UINT32 })
    @returns(
        { name: 'deployer', type: ABIDataTypes.ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'block', type: ABIDataTypes.UINT64 },
    )
    public getDeploymentByIndex(calldata: Calldata): BytesWriter {
        const index: u32 = calldata.readU32();
        const indexU256: u256 = u256.fromU32(index);

        if (indexU256 >= this.deploymentCount.value) {
            throw new Revert('Index out of bounds');
        }

        const tokenU256: u256 = this.globalTokens.get(indexU256);
        const tokenAddress: Address = this._addressFromU256(tokenU256);
        const deployerU256: u256 = this.tokenDeployers.get(tokenAddress);
        const deployer: Address = this._addressFromU256(deployerU256);
        // V2: Block is per-token
        const blockNum: u256 = this.tokenDeployBlock.get(tokenAddress);

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2 + 8);
        response.writeAddress(deployer);
        response.writeAddress(tokenAddress);
        response.writeU64(blockNum.toU64());
        return response;
    }

    // ── Token Info Queries ──

    @method({ name: 'tokenAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'deployer', type: ABIDataTypes.ADDRESS })
    public getTokenDeployer(calldata: Calldata): BytesWriter {
        const tokenAddress: Address = calldata.readAddress();
        const deployerU256: u256 = this.tokenDeployers.get(tokenAddress);
        const deployer: Address = this._addressFromU256(deployerU256);

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(deployer);
        return response;
    }

    @method({ name: 'tokenAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public getTokenOwner(calldata: Calldata): BytesWriter {
        const tokenAddress: Address = calldata.readAddress();
        const ownerU256: u256 = this.tokenOwners.get(tokenAddress);
        const owner: Address = this._addressFromU256(ownerU256);

        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(owner);
        return response;
    }

    // ── V2: Per-Deployer Multi-Token Queries ──

    /**
     * V2: Get how many tokens a deployer has created.
     */
    @method({ name: 'deployer', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT32 })
    public getUserTokenCount(calldata: Calldata): BytesWriter {
        const deployer: Address = calldata.readAddress();
        const count: u256 = this.deployerTokenCount.get(deployer);

        const response: BytesWriter = new BytesWriter(4);
        response.writeU32(count.toU32());
        return response;
    }

    /**
     * V2: Get a deployer's token by local index.
     * Iterates the global list and returns the Nth match for this deployer.
     * O(n) but acceptable for read-only view calls.
     */
    @method(
        { name: 'deployer', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT32 },
    )
    @returns(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'block', type: ABIDataTypes.UINT64 },
    )
    public getUserTokenByIndex(calldata: Calldata): BytesWriter {
        const deployer: Address = calldata.readAddress();
        const targetIndex: u32 = calldata.readU32();

        const deployerCount: u256 = this.deployerTokenCount.get(deployer);
        if (u256.fromU32(targetIndex) >= deployerCount) {
            throw new Revert('Index out of bounds');
        }

        // Iterate global deployments, find Nth match for this deployer
        const total: u32 = this.deploymentCount.value.toU32();
        let matched: u32 = 0;

        for (let i: u32 = 0; i < total; i++) {
            const tokenU256: u256 = this.globalTokens.get(u256.fromU32(i));
            const tokenAddr: Address = this._addressFromU256(tokenU256);
            const tokenDeployerU256: u256 = this.tokenDeployers.get(tokenAddr);
            const tokenDeployer: Address = this._addressFromU256(tokenDeployerU256);

            if (tokenDeployer.equals(deployer)) {
                if (matched == targetIndex) {
                    const blockNum: u256 = this.tokenDeployBlock.get(tokenAddr);

                    const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + 8);
                    response.writeAddress(tokenAddr);
                    response.writeU64(blockNum.toU64());
                    return response;
                }
                matched++;
            }
        }

        throw new Revert('Token not found');
    }

    /**
     * Get deployment info for a specific deployer address.
     * V2: Returns the FIRST token deployed by this deployer (backward compatible).
     * Use getUserTokenCount + getUserTokenByIndex for all tokens.
     */
    @method({ name: 'deployer', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'has', type: ABIDataTypes.BOOL },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'block', type: ABIDataTypes.UINT64 },
    )
    public getDeploymentInfo(calldata: Calldata): BytesWriter {
        const deployer: Address = calldata.readAddress();
        const count: u256 = this.deployerTokenCount.get(deployer);
        const has: bool = !count.isZero();

        // Find the first token for this deployer
        let firstToken: Address = changetype<Address>(new Uint8Array(ADDRESS_BYTE_LENGTH));
        let firstBlock: u64 = 0;

        if (has) {
            const total: u32 = this.deploymentCount.value.toU32();
            for (let i: u32 = 0; i < total; i++) {
                const tokenU256: u256 = this.globalTokens.get(u256.fromU32(i));
                const tokenAddr: Address = this._addressFromU256(tokenU256);
                const tokenDeployerU256: u256 = this.tokenDeployers.get(tokenAddr);
                const tokenDeployer: Address = this._addressFromU256(tokenDeployerU256);

                if (tokenDeployer.equals(deployer)) {
                    firstToken = tokenAddr;
                    firstBlock = this.tokenDeployBlock.get(tokenAddr).toU64();
                    break;
                }
            }
        }

        const response: BytesWriter = new BytesWriter(1 + ADDRESS_BYTE_LENGTH + 8);
        response.writeBoolean(has);
        response.writeAddress(firstToken);
        response.writeU64(firstBlock);
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
    // ██  INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════

    private _onlyOwner(): void {
        if (!this.factoryOwner.value.equals(Blockchain.tx.sender)) {
            throw new Revert('Only factory owner can call this');
        }
    }

    /**
     * V2: Reentrancy guard — acquire lock.
     * If the function reverts, state is rolled back (lock released automatically).
     * On success, call _endNonReentrant() before returning.
     */
    private _nonReentrant(): void {
        if (this.reentrancyLock.value) throw new Revert('Reentrancy detected');
        this.reentrancyLock.value = true;
    }

    /**
     * V2: Reentrancy guard — release lock.
     */
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
