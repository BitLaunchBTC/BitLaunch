
import {
    Mnemonic,
    AddressTypes,
    MLDSASecurityLevel,
    TransactionFactory,
    BinaryWriter
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log('🔒 Deploying LiquidityLock (Simple)...');

    const network = networks.regtest;
    const provider = new JSONRpcProvider('https://regtest.opnet.org', network);
    const factory = new TransactionFactory();

    // Wallet
    const mnemonic = "suggest fiscal excuse trophy maze lunar someone side odor robust clerk note";
    const wallet = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log('Wallet:', wallet.p2tr);

    // UTXOs
    const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    console.log('UTXOs:', utxos.length);
    if (utxos.length === 0) throw new Error('No UTXOs');

    // Bytecode
    const wasmPath = path.join(__dirname, 'build/LiquidityLock.wasm');
    const bytecode = fs.readFileSync(wasmPath);
    console.log('Bytecode size:', bytecode.length);

    // Deploy Params
    const challenge = await provider.getChallenge();
    console.log('Challenge:', challenge.toString('hex'));

    const params = {
        from: wallet.p2tr,
        utxos: utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: network,
        feeRate: 10,
        priorityFee: 0n, // Match deploy-contracts.js
        gasSatFee: 50000n, // Match deploy-contracts.js
        bytecode: bytecode,
        calldata: undefined, // Explicitly undefined
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true
    };

    console.log('Signing...');
    try {
        const deployment = await factory.signDeployment(params);
        console.log('✅ Signed! Contract:', deployment.contractAddress);
        console.log('Funding TX:', deployment.transaction[0].substring(0, 64) + '...');

        console.log('Broadcasting Funding...');
        const fundingTxId = await provider.sendRawTransaction(deployment.transaction[0]);
        console.log('Funding ID:', fundingTxId);

        console.log('Broadcasting Reveal...');
        const revealTxId = await provider.sendRawTransaction(deployment.transaction[1]);
        console.log('Reveal ID:', revealTxId);

        console.log('🎉 DONE. Address:', deployment.contractAddress);

        // Update deployed.json manually if needed
        const configPath = path.join(__dirname, 'deployed.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        if (!config.contracts) config.contracts = {};
        config.contracts.lock = {
            name: "LiquidityLock",
            contractAddress: deployment.contractAddress,
            txHash: (typeof revealTxId === 'string') ? revealTxId : revealTxId.txid,
            network: 'regtest',
            platformWallet: wallet.p2tr,
            deployedAt: new Date().toISOString()
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('Updated deployed.json');

    } catch (e) {
        console.error('❌ Sign/Broadcast Failed:', e);
        if (e.stack) console.error(e.stack);
    }
}

main();
