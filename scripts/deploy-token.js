#!/usr/bin/env node
/**
 * BitLaunch CLI Token Deployer
 * 
 * Deploy OP20 tokens from command line using OPNet TransactionFactory
 * 
 * Usage:
 *   node deploy-token.js --name "Token Name" --symbol "TKN" --decimals 18 --supply 1000000
 * 
 * Prerequisites:
 *   1. Install deps: npm install opnet @btc-vision/transaction @btc-vision/bitcoin
 *   2. Have compiled WASM bytecode at ./bytecode/MyToken.wasm
 *   3. Set MNEMONIC env variable with your seed phrase
 */

import { JSONRpcProvider } from 'opnet';
import {
    TransactionFactory,
    Mnemonic,
    BinaryWriter,
    AddressTypes,
    MLDSASecurityLevel
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import * as fs from 'fs';
import * as path from 'path';

// ============ Configuration ============
const CONFIG = {
    network: 'regtest',  // 'mainnet' | 'testnet' | 'regtest'
    rpcUrl: 'https://regtest.opnet.org',
    bytecodeFile: './bytecode/MyToken.wasm',
    feeRate: 5,
    gasSatFee: 10_000n
};

const NETWORKS = {
    mainnet: { btc: networks.bitcoin, rpc: 'https://api.opnet.org' },
    testnet: { btc: networks.testnet, rpc: 'https://testnet.opnet.org' },
    regtest: { btc: networks.regtest, rpc: 'https://regtest.opnet.org' }
};

// ============ Helper Functions ============

function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        params[key] = value;
    }

    return {
        name: params.name || 'MyToken',
        symbol: params.symbol || 'MTK',
        decimals: parseInt(params.decimals || '18'),
        supply: BigInt(params.supply || '1000000'),
        network: params.network || CONFIG.network,
        bytecode: params.bytecode || CONFIG.bytecodeFile
    };
}

function createTokenCalldata(name, symbol, decimals, maxSupply) {
    const writer = new BinaryWriter();

    // Write in order expected by contract's onDeployment
    writer.writeStringWithLength(name);
    writer.writeStringWithLength(symbol);
    writer.writeU8(decimals);
    writer.writeU256(maxSupply);

    return writer.getBuffer();
}

// ============ Main Deployment Function ============

async function deployToken() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 BitLaunch Token Deployer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Parse arguments
    const params = parseArgs();
    console.log('Token Configuration:');
    console.log(`  Name: ${params.name}`);
    console.log(`  Symbol: ${params.symbol}`);
    console.log(`  Decimals: ${params.decimals}`);
    console.log(`  Supply: ${params.supply.toString()}`);
    console.log(`  Network: ${params.network}`);
    console.log(`  Bytecode: ${params.bytecode}\n`);

    // Check mnemonic
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('❌ Error: MNEMONIC environment variable not set');
        console.error('Set it with: export MNEMONIC="your seed phrase here"');
        process.exit(1);
    }

    // Check bytecode file
    if (!fs.existsSync(params.bytecode)) {
        console.error(`❌ Error: Bytecode file not found: ${params.bytecode}`);
        console.error('Make sure to compile your contract first.');
        console.error('See: npm run build:token');
        process.exit(1);
    }

    // Load bytecode
    console.log('📦 Loading bytecode...');
    const bytecode = fs.readFileSync(params.bytecode);
    console.log(`   Size: ${bytecode.length} bytes`);

    // Setup network
    const networkConfig = NETWORKS[params.network] || NETWORKS.regtest;
    const btcNetwork = networkConfig.btc;
    const rpcUrl = networkConfig.rpc;

    console.log(`\n🌐 Connecting to ${rpcUrl}...`);
    const provider = new JSONRpcProvider(rpcUrl, btcNetwork);

    // Create wallet from mnemonic
    console.log('🔑 Loading wallet...');
    const wallet = new Mnemonic(
        mnemonic,
        '',
        btcNetwork,
        MLDSASecurityLevel.LEVEL2
    ).deriveUnisat(AddressTypes.P2TR, 0);

    console.log(`   Address: ${wallet.p2tr}`);

    // Get UTXOs
    console.log('\n💰 Fetching UTXOs...');
    const utxos = await provider.utxoManager.getUTXOs({
        address: wallet.p2tr
    });

    if (utxos.length === 0) {
        console.error('❌ No UTXOs found. Fund your wallet first.');
        console.error(`   Address: ${wallet.p2tr}`);
        process.exit(1);
    }

    const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0n);
    console.log(`   Found ${utxos.length} UTXOs`);
    console.log(`   Balance: ${totalBalance} sats`);

    // Get challenge
    console.log('\n⚡ Getting challenge...');
    const challenge = await provider.getChallenge();

    // Create calldata
    console.log('📝 Creating calldata...');
    const maxSupply = params.supply * BigInt(10 ** params.decimals);
    const calldata = createTokenCalldata(
        params.name,
        params.symbol,
        params.decimals,
        maxSupply
    );
    console.log(`   Calldata size: ${calldata.length} bytes`);

    // Create deployment
    console.log('\n🔨 Building deployment transaction...');
    const factory = new TransactionFactory();

    const deploymentParams = {
        from: wallet.p2tr,
        utxos: utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: btcNetwork,
        feeRate: CONFIG.feeRate,
        priorityFee: 0n,
        gasSatFee: CONFIG.gasSatFee,
        bytecode: bytecode,
        calldata: calldata,
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true
    };

    const deployment = await factory.signDeployment(deploymentParams);

    console.log(`\n📋 Deployment Details:`);
    console.log(`   Contract Address: ${deployment.contractAddress}`);
    console.log(`   Estimated Fees: ${deployment.estimatedFees} sats`);

    // Broadcast transactions
    console.log('\n📡 Broadcasting transactions...');

    console.log('   Funding TX...');
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0]);
    console.log(`   ✅ Funding TX: ${fundingResult.txid || 'Sent'}`);

    console.log('   Reveal TX...');
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1]);
    console.log(`   ✅ Reveal TX: ${revealResult.txid || 'Sent'}`);

    // Success!
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 DEPLOYMENT SUCCESSFUL!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\nContract Address: ${deployment.contractAddress}`);
    console.log(`\nToken Details:`);
    console.log(`  Name: ${params.name}`);
    console.log(`  Symbol: ${params.symbol}`);
    console.log(`  Decimals: ${params.decimals}`);
    console.log(`  Total Supply: ${params.supply.toString()}`);
    console.log('\n');

    // Close provider
    await provider.close();

    return deployment.contractAddress;
}

// ============ Run ============

deployToken()
    .then((address) => {
        console.log('Done! Contract:', address);
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Deployment failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    });
