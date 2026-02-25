// OP20 Token Template V2 for Factory Deployment
// Deployed once, then cloned by the factory via deployContractFromExisting().
// Initialization happens via initialize() method call (two-step pattern).
//
// V2 Changes:
//   - Per-user free mint cap (prevents single user draining supply)
//   - Burn support (toggleable by creator)
//   - Pausable transfers (emergency stop)
//   - Ownership renouncement (true decentralization)
//   - initialize() takes 11 params (added freeMintUserCap, burnEnabled)

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Calldata,
    NetEvent,
    OP20,
    OP20InitParameters,
    Revert,
    SafeMath,
    StoredAddress,
    StoredBoolean,
    StoredU256,
    AddressMemoryMap,
    U256_BYTE_LENGTH,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';

import { ON_OP20_RECEIVED_SELECTOR } from '@btc-vision/btc-runtime/runtime/constants/Exports';

// ── Storage Pointers (OP20 uses 0-6, we start at 7+) ──
const TOKEN_OWNER_POINTER: u16 = Blockchain.nextPointer;
const FACTORY_ADDRESS_POINTER: u16 = Blockchain.nextPointer;
const INITIALIZED_POINTER: u16 = Blockchain.nextPointer;
const MINTER_ROLES_POINTER: u16 = Blockchain.nextPointer;
const FREE_MINT_SUPPLY_POINTER: u16 = Blockchain.nextPointer;
const FREE_MINT_PER_TX_POINTER: u16 = Blockchain.nextPointer;
const FREE_MINT_CLAIMED_POINTER: u16 = Blockchain.nextPointer;
const FREE_MINT_PER_USER_POINTER: u16 = Blockchain.nextPointer;    // V2: per-user tracking
const FREE_MINT_USER_CAP_POINTER: u16 = Blockchain.nextPointer;    // V2: max per address
const PAUSED_POINTER: u16 = Blockchain.nextPointer;                 // V2: pausable
const BURN_ENABLED_POINTER: u16 = Blockchain.nextPointer;           // V2: burnable toggle

// ── Events ──

@final
class FreeMintConfiguredEvent extends NetEvent {
    constructor(token: Address, supply: u256, perTxLimit: u256, userCap: u256) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH * 3,
        );
        data.writeAddress(token);
        data.writeU256(supply);
        data.writeU256(perTxLimit);
        data.writeU256(userCap);
        super('FreeMintConfigured', data);
    }
}

@final
class FreeMintClaimedEvent extends NetEvent {
    constructor(user: Address, token: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeAddress(user);
        data.writeAddress(token);
        data.writeU256(amount);
        super('FreeMintClaimed', data);
    }
}

@final
class TokenOwnerTransferredEvent extends NetEvent {
    constructor(previousOwner: Address, newOwner: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        data.writeAddress(previousOwner);
        data.writeAddress(newOwner);
        super('TokenOwnerTransferred', data);
    }
}

@final
class OwnershipRenouncedEvent extends NetEvent {
    constructor(previousOwner: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(previousOwner);
        super('OwnershipRenounced', data);
    }
}

@final
class TokenPausedEvent extends NetEvent {
    constructor(by: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(by);
        super('TokenPaused', data);
    }
}

@final
class TokenUnpausedEvent extends NetEvent {
    constructor(by: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(by);
        super('TokenUnpaused', data);
    }
}

@final
class TokenBurnedEvent extends NetEvent {
    constructor(from: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
        data.writeAddress(from);
        data.writeU256(amount);
        super('TokenBurned', data);
    }
}

// ── Contract ──

@final
export class OP20Template extends OP20 {
    // Storage
    private readonly tokenOwner: StoredAddress;
    private readonly factoryAddress: StoredAddress;
    private readonly initialized: StoredBoolean;
    private readonly minterRoles: AddressMemoryMap;
    private readonly freeMintSupplyRemaining: StoredU256;
    private readonly freeMintPerTx: StoredU256;
    private readonly freeMintTotalClaimed: StoredU256;
    private readonly freeMintPerUser: AddressMemoryMap;     // V2
    private readonly freeMintUserCap: StoredU256;            // V2
    private readonly paused: StoredBoolean;                  // V2
    private readonly burnEnabled: StoredBoolean;             // V2

    public constructor() {
        super();
        this.tokenOwner = new StoredAddress(TOKEN_OWNER_POINTER);
        this.factoryAddress = new StoredAddress(FACTORY_ADDRESS_POINTER);
        this.initialized = new StoredBoolean(INITIALIZED_POINTER, false);
        this.minterRoles = new AddressMemoryMap(MINTER_ROLES_POINTER);
        this.freeMintSupplyRemaining = new StoredU256(FREE_MINT_SUPPLY_POINTER, EMPTY_POINTER);
        this.freeMintPerTx = new StoredU256(FREE_MINT_PER_TX_POINTER, EMPTY_POINTER);
        this.freeMintTotalClaimed = new StoredU256(FREE_MINT_CLAIMED_POINTER, EMPTY_POINTER);
        this.freeMintPerUser = new AddressMemoryMap(FREE_MINT_PER_USER_POINTER);
        this.freeMintUserCap = new StoredU256(FREE_MINT_USER_CAP_POINTER, EMPTY_POINTER);
        this.paused = new StoredBoolean(PAUSED_POINTER, false);
        this.burnEnabled = new StoredBoolean(BURN_ENABLED_POINTER, false);
    }

    /**
     * Called when contract is deployed/cloned.
     * Intentionally empty — initialization happens via initialize() method.
     */
    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);
    }

    // ── Pausable Transfer Overrides ──

    /**
     * Override transfer to enforce pause check.
     */
    public override transfer(calldata: Calldata): BytesWriter {
        this._whenNotPaused();
        return super.transfer(calldata);
    }

    /**
     * Override transferFrom to enforce pause check.
     */
    public override transferFrom(calldata: Calldata): BytesWriter {
        this._whenNotPaused();
        return super.transferFrom(calldata);
    }

    // ── Initialize (called by factory after clone) ──

    /**
     * Initialize the token after clone deployment.
     * Called by factory via Blockchain.call() after deployContractFromExisting().
     * Can only be called once (enforced by initialized flag).
     *
     * V2: 11 params (added freeMintUserCap, burnEnabled)
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
    @emit('FreeMintConfigured')
    public initialize(calldata: Calldata): BytesWriter {
        if (this.initialized.value) throw new Revert('Already initialized');

        // Read all 11 params in order
        const maxSupply: u256 = calldata.readU256();
        if (maxSupply.isZero()) throw new Revert('Max supply must be > 0');

        const decimals: u8 = calldata.readU8();

        const name: string = calldata.readStringWithLength();
        if (name.length == 0 || name.length > 50) throw new Revert('Name must be 1-50 chars');

        const symbol: string = calldata.readStringWithLength();
        if (symbol.length == 0 || symbol.length > 10) throw new Revert('Symbol must be 1-10 chars');

        const initialMintTo: Address = calldata.readAddress();
        const initialMintAmount: u256 = calldata.readU256();
        const freeMintSupply: u256 = calldata.readU256();
        const freeMintPerTxAmount: u256 = calldata.readU256();
        const freeMintUserCapAmount: u256 = calldata.readU256(); // V2
        const owner: Address = calldata.readAddress();
        const isBurnEnabled: bool = calldata.readBoolean(); // V2

        if (initialMintAmount > maxSupply) throw new Revert('Initial mint exceeds max supply');
        if (owner.isZero()) throw new Revert('Invalid token owner');

        // Validate: freeMintSupply + initialMintAmount <= maxSupply
        if (!freeMintSupply.isZero()) {
            const totalReserved: u256 = SafeMath.add(initialMintAmount, freeMintSupply);
            if (totalReserved > maxSupply) throw new Revert('Initial + free mint exceeds max supply');

            // freeMintUserCap must be > 0 if free mint is enabled (V2 enforcement)
            if (freeMintUserCapAmount.isZero()) throw new Revert('Free mint user cap must be > 0');
        }

        // Initialize OP20 (skip deployer verification — factory deploys this clone)
        this.instantiate(new OP20InitParameters(maxSupply, decimals, name, symbol), true);

        // Set token owner
        this.tokenOwner.value = owner;

        // Store the factory address (the contract calling initialize)
        this.factoryAddress.value = Blockchain.tx.sender;

        // V2: Set burn enabled flag
        this.burnEnabled.value = isBurnEnabled;

        // Mark as initialized
        this.initialized.value = true;

        // Pre-mint initial tokens to the specified address
        if (!initialMintTo.isZero() && !initialMintAmount.isZero()) {
            this._mint(initialMintTo, initialMintAmount);
        }

        // Configure free mint if supply > 0
        if (!freeMintSupply.isZero()) {
            this.freeMintSupplyRemaining.value = freeMintSupply;
            this.freeMintPerTx.value = freeMintPerTxAmount;
            this.freeMintUserCap.value = freeMintUserCapAmount; // V2

            this.emitEvent(
                new FreeMintConfiguredEvent(
                    Blockchain.contract.address,
                    freeMintSupply,
                    freeMintPerTxAmount,
                    freeMintUserCapAmount,
                ),
            );
        }

        return new BytesWriter(0);
    }

    // ── Minting ──

    /**
     * Mint tokens — only token owner or granted minters can call
     */
    @method(
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @emit('Minted')
    public mint(calldata: Calldata): BytesWriter {
        this._onlyOwnerOrMinter();

        const to: Address = calldata.readAddress();
        if (to.isZero()) throw new Revert('Invalid recipient');

        const amount: u256 = calldata.readU256();
        if (amount.isZero()) throw new Revert('Amount must be > 0');

        this._mint(to, amount);

        return new BytesWriter(0);
    }

    /**
     * Free mint — anyone can call if free mint is configured.
     * V2: enforces per-user cap via freeMintPerUser AddressMemoryMap.
     */
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('FreeMintClaimed')
    public freeMint(calldata: Calldata): BytesWriter {
        const amount: u256 = calldata.readU256();
        if (amount.isZero()) throw new Revert('Amount must be > 0');

        const perTxLimit: u256 = this.freeMintPerTx.value;
        if (perTxLimit.isZero()) throw new Revert('Free mint not configured');
        if (amount > perTxLimit) throw new Revert('Exceeds per-tx limit');

        const remaining: u256 = this.freeMintSupplyRemaining.value;
        if (remaining.isZero()) throw new Revert('Free mint supply exhausted');
        if (amount > remaining) throw new Revert('Exceeds remaining free mint supply');

        // V2: Per-user cap enforcement
        const sender: Address = Blockchain.tx.sender;
        const userCap: u256 = this.freeMintUserCap.value;
        if (!userCap.isZero()) {
            const alreadyClaimed: u256 = this.freeMintPerUser.get(sender);
            const newTotal: u256 = SafeMath.add(alreadyClaimed, amount);
            if (newTotal > userCap) throw new Revert('Exceeds per-user free mint cap');

            // Update per-user claimed amount
            this.freeMintPerUser.set(sender, newTotal);
        }

        // Update global remaining supply and total claimed
        this.freeMintSupplyRemaining.value = SafeMath.sub(remaining, amount);
        this.freeMintTotalClaimed.value = SafeMath.add(
            this.freeMintTotalClaimed.value,
            amount,
        );

        // Mint to caller
        this._mint(sender, amount);

        this.emitEvent(
            new FreeMintClaimedEvent(sender, Blockchain.contract.address, amount),
        );

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── V2: Burn ──

    /**
     * Burn tokens from caller's balance — only if burn is enabled.
     */
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('TokenBurned')
    public burn(calldata: Calldata): BytesWriter {
        if (!this.burnEnabled.value) throw new Revert('Burn is disabled');

        const amount: u256 = calldata.readU256();
        if (amount.isZero()) throw new Revert('Amount must be > 0');

        const sender: Address = Blockchain.tx.sender;
        this._burn(sender, amount);

        this.emitEvent(new TokenBurnedEvent(sender, amount));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── V2: Pause/Unpause ──

    /**
     * Pause all token transfers — only token owner.
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('TokenPaused')
    public pause(_calldata: Calldata): BytesWriter {
        this._onlyTokenOwner();
        if (this.paused.value) throw new Revert('Already paused');

        this.paused.value = true;
        this.emitEvent(new TokenPausedEvent(Blockchain.tx.sender));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Unpause token transfers — only token owner.
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('TokenUnpaused')
    public unpause(_calldata: Calldata): BytesWriter {
        this._onlyTokenOwner();
        if (!this.paused.value) throw new Revert('Not paused');

        this.paused.value = false;
        this.emitEvent(new TokenUnpausedEvent(Blockchain.tx.sender));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── Minter Roles ──

    /**
     * Grant minter role to an address — only token owner
     */
    @method({ name: 'minter', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public grantMinterRole(calldata: Calldata): BytesWriter {
        this._onlyTokenOwner();

        const minter: Address = calldata.readAddress();
        if (minter.isZero()) throw new Revert('Invalid minter address');

        this.minterRoles.set(minter, u256.One);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Revoke minter role from an address — only token owner
     */
    @method({ name: 'minter', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public revokeMinterRole(calldata: Calldata): BytesWriter {
        this._onlyTokenOwner();

        const minter: Address = calldata.readAddress();
        if (minter.isZero()) throw new Revert('Invalid minter address');

        this.minterRoles.set(minter, u256.Zero);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Check if an address has minter role
     */
    @method({ name: 'account', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'isMinter', type: ABIDataTypes.BOOL })
    public isMinter(calldata: Calldata): BytesWriter {
        const account: Address = calldata.readAddress();
        const val: u256 = this.minterRoles.get(account);

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(!val.isZero());
        return response;
    }

    // ── Ownership ──

    /**
     * Override the base OP_NET deployer() method.
     * The base class returns Blockchain.contractDeployer which is the factory address
     * for cloned contracts. We return the tokenOwner so the wallet recognizes the
     * actual user as the deployer (enables mint option, ownership display, etc).
     */
    @method()
    @returns({ name: 'deployer', type: ABIDataTypes.ADDRESS })
    public deployer(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.tokenOwner.value);
        return response;
    }

    /**
     * Get the token owner address
     */
    @method()
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public getTokenOwner(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.tokenOwner.value);
        return response;
    }

    /**
     * Get the factory address that deployed this token
     */
    @method()
    @returns({ name: 'factory', type: ABIDataTypes.ADDRESS })
    public getFactoryAddress(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.factoryAddress.value);
        return response;
    }

    /**
     * Transfer token ownership — only current owner
     */
    @method({ name: 'newOwner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('TokenOwnerTransferred')
    public transferTokenOwner(calldata: Calldata): BytesWriter {
        this._onlyTokenOwner();

        const newOwner: Address = calldata.readAddress();
        if (newOwner.isZero()) throw new Revert('Invalid new owner');

        const previousOwner: Address = this.tokenOwner.value;
        this.tokenOwner.value = newOwner;

        this.emitEvent(new TokenOwnerTransferredEvent(previousOwner, newOwner));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    /**
     * V2: Renounce ownership — permanently sets owner to zero address.
     * This is irreversible. No one can mint, pause, or manage minter roles after this.
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OwnershipRenounced')
    public renounceOwnership(_calldata: Calldata): BytesWriter {
        this._onlyTokenOwner();

        const previousOwner: Address = this.tokenOwner.value;
        // Set owner to zero address — no sender can ever match this
        const deadAddress: Address = changetype<Address>(new Uint8Array(ADDRESS_BYTE_LENGTH));
        this.tokenOwner.value = deadAddress;

        this.emitEvent(new OwnershipRenouncedEvent(previousOwner));

        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ── View Methods ──

    /**
     * V2: Check if token is paused
     */
    @method()
    @returns({ name: 'paused', type: ABIDataTypes.BOOL })
    public isPaused(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.paused.value);
        return response;
    }

    /**
     * V2: Check if burn is enabled
     */
    @method()
    @returns({ name: 'burnEnabled', type: ABIDataTypes.BOOL })
    public isBurnEnabledView(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(this.burnEnabled.value);
        return response;
    }

    /**
     * Get free mint configuration info
     * V2: includes userCap
     */
    @method()
    @returns({ name: 'info', type: ABIDataTypes.BYTES })
    public getFreeMintInfo(_: Calldata): BytesWriter {
        const remaining: u256 = this.freeMintSupplyRemaining.value;
        const perTx: u256 = this.freeMintPerTx.value;
        const userCap: u256 = this.freeMintUserCap.value;
        const totalClaimed: u256 = this.freeMintTotalClaimed.value;

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 4);
        response.writeU256(remaining);
        response.writeU256(perTx);
        response.writeU256(userCap);
        response.writeU256(totalClaimed);
        return response;
    }

    /**
     * V2: Get how much a specific user has claimed via free mint
     */
    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'claimed', type: ABIDataTypes.UINT256 })
    public getFreeMintClaimed(calldata: Calldata): BytesWriter {
        const user: Address = calldata.readAddress();
        const claimed: u256 = this.freeMintPerUser.get(user);

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(claimed);
        return response;
    }

    // ── OP20 Receive Callback ──

    /**
     * Called when this contract receives OP20 tokens via safeTransfer
     */
    @method(
        { name: 'operator', type: ABIDataTypes.ADDRESS },
        { name: 'from', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'data', type: ABIDataTypes.BYTES },
    )
    @returns({ name: 'selector', type: ABIDataTypes.BYTES4 })
    public onOP20Received(calldata: Calldata): BytesWriter {
        // Accept all OP20 token transfers
        calldata.readAddress(); // operator
        calldata.readAddress(); // from
        calldata.readU256();    // amount
        calldata.readBytesWithLength(); // data

        const response: BytesWriter = new BytesWriter(4);
        response.writeSelector(ON_OP20_RECEIVED_SELECTOR);
        return response;
    }

    // ── Internal Helpers ──

    private _onlyTokenOwner(): void {
        const owner: Address = this.tokenOwner.value;
        if (owner.isZero()) throw new Revert('Ownership renounced');
        if (!owner.equals(Blockchain.tx.sender)) {
            throw new Revert('Only token owner can call this');
        }
    }

    private _onlyOwnerOrMinter(): void {
        const sender: Address = Blockchain.tx.sender;
        const owner: Address = this.tokenOwner.value;

        if (!owner.isZero() && owner.equals(sender)) return;

        const minterVal: u256 = this.minterRoles.get(sender);
        if (!minterVal.isZero()) return;

        throw new Revert('Only owner or minter can call this');
    }

    private _whenNotPaused(): void {
        if (this.paused.value) {
            throw new Revert('Token transfers are paused');
        }
    }
}
