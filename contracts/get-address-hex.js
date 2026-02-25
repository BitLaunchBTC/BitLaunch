
import { Mnemonic, AddressTypes, MLDSASecurityLevel } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const mnemonic = "suggest fiscal excuse trophy maze lunar someone side odor robust clerk note";
const wallet = new Mnemonic(mnemonic, '', networks.regtest, MLDSASecurityLevel.LEVEL2).deriveOPWallet(AddressTypes.P2TR, 0);

console.log('Hex Address:', Buffer.from(wallet.address).toString('hex'));
