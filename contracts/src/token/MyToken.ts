import { u256 } from '@btc-vision/as-bignum/assembly/integer/u256';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
    Revert,
} from '@btc-vision/btc-runtime/runtime';

@final
export class MyToken extends OP20 {
    public constructor() {
        super();
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        // Read initialization parameters from calldata dynamically
        const name: string = calldata.readStringWithLength();
        const symbol: string = calldata.readStringWithLength();
        const decimals: u8 = calldata.readU8();
        const maxSupply: u256 = calldata.readU256();
        if (maxSupply.isZero()) throw new Revert('Max supply must be > 0');

        const initialSupply: u256 = calldata.readU256();
        if (initialSupply > maxSupply) throw new Revert('Initial supply exceeds max');

        // Instantiate with dynamic values
        this.instantiate(new OP20InitParameters(maxSupply, decimals, name, symbol));

        // Mint initial supply to deployer
        if (!initialSupply.isZero()) {
            this._mint(Blockchain.tx.origin, initialSupply);
        }
    }

    @method(
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @emit('Minted')
    public mint(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const to: Address = calldata.readAddress();
        if (to.isZero()) throw new Revert('Invalid recipient address');

        const amount: u256 = calldata.readU256();
        if (amount.isZero()) throw new Revert('Amount must be > 0');

        this._mint(to, amount);

        return new BytesWriter(0);
    }
}
