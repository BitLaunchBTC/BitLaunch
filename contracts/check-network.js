
import { networks } from '@btc-vision/bitcoin';
import { AddressVerificator } from '@btc-vision/transaction';

const network = networks.regtest;
console.log('Regtest Network Config:', JSON.stringify(network, null, 2));

const address = 'opr1sqqnuqsep630u87zqn2j8w0jt5jh9cak8tvv0nxda';
console.log(`\nTesting Address: ${address}`);

try {
    const type = AddressVerificator.detectAddressType(address, network);
    console.log(`Detected Type: ${type}`);
} catch (e) {
    console.error('Detection Error:', e);
}

// Check what 'opr' is expected to be
if (network.bech32Opnet) {
    console.log(`Expected bech32Opnet: ${network.bech32Opnet}`);
} else {
    console.log('network.bech32Opnet is UNDEFINED');
}
