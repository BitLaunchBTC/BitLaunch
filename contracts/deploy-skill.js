
import {
    AddressTypes,

    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const network = networks.regtest;
const provider = new JSONRpcProvider('https://regtest.opnet.org', network);
const mnemonic = new Mnemonic("suggest fiscal excuse trophy maze lunar someone side odor robust clerk note", '', network, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
const factory = new TransactionFactory();

async function deployContract(bytecodeFile) {
    console.log(`Deploying ${bytecodeFile}...`);
    const bytecode = fs.readFileSync(bytecodeFile);

    // Get UTXOs
    const utxos = await provider.utxoManager.getUTXOs({
        address: wallet.p2tr,
    });

    if (utxos.length === 0) {
        throw new Error('No UTXOs available for deployment');
    }

    // Get challenge
    const challenge = await provider.getChallenge();

    // Prepare deployment parameters
    const deploymentParams = {
        from: wallet.p2tr,
        utxos: utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: network,
        feeRate: 10,
        priorityFee: 0n,
        gasSatFee: 10_000n, // As per skill example
        bytecode: bytecode,
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    // Sign deployment
    const deployment = await factory.signDeployment(deploymentParams);

    console.log('Contract address:', deployment.contractAddress);
    console.log('Funding TX:', deployment.transaction[0]);
    console.log('Reveal TX:', deployment.transaction[1]);

    // Broadcast funding transaction
    const fundingResult = await provider.sendRawTransaction(
        deployment.transaction[0]
    );
    console.log('Funding TX ID:', fundingResult);

    // Broadcast reveal transaction
    const revealResult = await provider.sendRawTransaction(
        deployment.transaction[1]
    );
    console.log('Reveal TX ID:', revealResult);

    return deployment.contractAddress;
}

// Usage
const wasmPath = path.join(__dirname, 'build/LiquidityLock.wasm');
deployContract(wasmPath).catch(console.error);
