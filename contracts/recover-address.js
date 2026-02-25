
import { Mnemonic, AddressTypes, MLDSASecurityLevel } from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const network = networks.regtest;
const provider = new JSONRpcProvider('https://regtest.opnet.org', network);
const mnemonic = new Mnemonic("suggest fiscal excuse trophy maze lunar someone side odor robust clerk note", '', network, MLDSASecurityLevel.LEVEL2);

// Generate first 5 wallets
const wallets = [];
for (let i = 0; i < 5; i++) {
    const w = mnemonic.deriveOPWallet(AddressTypes.P2TR, i);
    wallets.push(w.p2tr);
}
console.log('Watching Wallets:', wallets);

// Partial TXID to look for: 97b56e48e7e9cd3a84f8a9fa871dabd1a3ebe
// Full TXID is likely this partial + more chars or vice versa.
// Actually, output said: "Deploy TX: 97b56e48e7e9cd3a84f8a9fa871dabd1a3ebe"
// It might be truncated? TXIDs are 64 chars. "97b5" is 4 chars.
// 97b56e48e7e9cd3a84f8a9fa871dabd1a3ebe is 40 chars. 
// A full TXID is 64 hex chars. 
// I will look for any TX starting with this.

const TARGET_PREFIX = '97b56e48e7e9cd3a84f8a9fa871dabd1a3ebe';

async function main() {
    console.log(`\n🔍 Scanning Blocks for Deployment TX...`);

    try {
        const height = Number(await provider.getBlockNumber());
        console.log(`Current Block Height: ${height}`);

        // Scan last 5 blocks
        const start = Math.max(0, height - 5);

        for (let i = height; i >= start; i--) {
            try {
                const block = await provider.getBlock(i, true);
                if (block && block.transactions) {
                    for (const tx of block.transactions) {
                        const txId = tx.id || tx.txId || tx.hash;

                        // Check if this matches our target
                        if (txId.includes(TARGET_PREFIX)) {
                            console.log(`\n🎉 FOUND DEPLOYMENT TX: ${txId}`);
                            console.log(`   Block: ${i}`);

                            // Print Outputs to find contract
                            tx.outputs.forEach((out, idx) => {
                                console.log(`   Output ${idx}: ${out.to} (${out.value} sats)`);
                                if (out.to && out.to.startsWith('opr')) {
                                    console.log(`   🚀 CONTRACT ADDRESS: ${out.to}`);
                                }
                            });
                            return; // Done
                        }
                    }
                }
            } catch (err) {
                // ignore
            }
        }

        console.log('\n❌ Target TX not found in last 5 blocks.');
        console.log('   (It might mean it is still in Mempool or unconfirmed)');
        console.log('   Please mine a block!');

    } catch (e) {
        console.error('Scan Error:', e);
    }
}

main().catch(console.error);
