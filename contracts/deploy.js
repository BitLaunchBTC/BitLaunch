#!/usr/bin/env node
/**
 * BitLaunch Token Deployment Script
 * 
 * Deploys OP20 tokens directly using pre-compiled WASM bytecode.
 * 
 * Usage:
 *   cd contracts
 *   $env:MNEMONIC="your seed phrase here"
 *   node deploy.js --network regtest --name "MyToken" --symbol "MTK" --supply 1000000
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONFIG = {
    networks: {
        mainnet: { rpc: 'https://api.opnet.org' },
        testnet: { rpc: 'https://testnet.opnet.org' },
        regtest: { rpc: 'https://regtest.opnet.org' }
    },
    feeRate: 10,
    gasSatFee: 50000n
};

function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].replace('--', '');
            params[key] = args[i + 1];
            i++;
        }
    }
    return {
        network: params.network || 'regtest',
        name: params.name || 'MyToken',
        symbol: params.symbol || 'MTK',
        decimals: parseInt(params.decimals || '18'),
        supply: params.supply || '1000000000000000000000000000' // 1 billion with 18 decimals
    };
}

async function main() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 BitLaunch Token Deployment');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { network, name, symbol, decimals, supply } = parseArgs();
    console.log(`Network: ${network}`);
    console.log(`Token: ${name} (${symbol})`);
    console.log(`Decimals: ${decimals}`);
    console.log(`Max Supply: ${supply}`);

    // Check mnemonic
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('\n❌ Error: MNEMONIC environment variable not set');
        console.error('   PowerShell: $env:MNEMONIC="your twelve word seed phrase"');
        console.error('   Bash: export MNEMONIC="your twelve word seed phrase"');
        process.exit(1);
    }

    // Check bytecode file
    const bytecodeFile = path.join(__dirname, 'build/OP20.wasm');
    if (!fs.existsSync(bytecodeFile)) {
        console.error(`\n❌ Bytecode not found: ${bytecodeFile}`);
        console.error('   Place OP_20.wasm in the build folder');
        process.exit(1);
    }

    // Dynamic imports 
    console.log('\n📦 Loading modules...');

    let JSONRpcProvider, TransactionFactory, Mnemonic, BinaryWriter, AddressTypes, MLDSASecurityLevel, networks;

    try {
        const opnetModule = await import('opnet');
        JSONRpcProvider = opnetModule.JSONRpcProvider;

        const txModule = await import('@btc-vision/transaction');
        TransactionFactory = txModule.TransactionFactory;
        Mnemonic = txModule.Mnemonic;
        BinaryWriter = txModule.BinaryWriter;
        AddressTypes = txModule.AddressTypes;
        MLDSASecurityLevel = txModule.MLDSASecurityLevel;

        const btcModule = await import('@btc-vision/bitcoin');
        networks = btcModule.networks;
    } catch (err) {
        console.error('❌ Failed to load modules:', err.message);
        console.error('\nTry running: npm install');
        process.exit(1);
    }

    // Load bytecode
    const bytecode = fs.readFileSync(bytecodeFile);
    console.log(`📦 Bytecode: ${bytecode.length} bytes`);

    // Setup
    const networkConfig = CONFIG.networks[network] || CONFIG.networks.regtest;
    const networkMap = { mainnet: networks.bitcoin, bitcoin: networks.bitcoin, testnet: networks.opnetTestnet, regtest: networks.regtest };
    const btcNetwork = networkMap[network] || networks.regtest;

    if (network === 'mainnet') {
        throw new Error('Mainnet deployment disabled for safety. Remove this check if intentional.');
    }

    const provider = new JSONRpcProvider({ url: networkConfig.rpc, network: btcNetwork });
    const txFactory = new TransactionFactory();

    console.log(`RPC: ${networkConfig.rpc}`);

    // Create wallet
    const wallet = new Mnemonic(
        mnemonic, '', btcNetwork, MLDSASecurityLevel.LEVEL2
    ).deriveOPWallet(AddressTypes.P2TR, 0);

    console.log(`Wallet: ${wallet.p2tr}`);

    try {
        // Get UTXOs
        console.log('\n📡 Fetching UTXOs...');
        const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

        if (utxos.length === 0) {
            throw new Error('No UTXOs available. Fund your wallet first.');
        }

        const balance = utxos.reduce((sum, u) => sum + u.value, 0n);
        console.log(`   UTXOs: ${utxos.length}, Balance: ${balance} sats`);

        // Create calldata for token initialization
        console.log('\n📝 Creating calldata...');
        const calldata = new BinaryWriter();

        // Write max supply as u256 (32 bytes)
        const supplyBigInt = BigInt(supply);
        const supplyBytes = new Uint8Array(32);
        let temp = supplyBigInt;
        for (let i = 31; i >= 0; i--) {
            supplyBytes[i] = Number(temp & 0xFFn);
            temp >>= 8n;
        }
        calldata.writeBytes(supplyBytes);

        // Write decimals as u8
        calldata.writeU8(decimals);

        // Write name with length prefix
        calldata.writeStringWithLength(name);

        // Write symbol with length prefix  
        calldata.writeStringWithLength(symbol);

        // Get challenge
        console.log('🔐 Getting challenge...');
        const challenge = await provider.getChallenge();

        // Build deployment
        console.log('🔧 Building transaction...');
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
            calldata: calldata.getBuffer(),
            challenge: challenge,
            linkMLDSAPublicKeyToAddress: true,
            revealMLDSAPublicKey: true
        };

        const deployment = await txFactory.signDeployment(deploymentParams);

        console.log(`\n✅ Transaction built!`);
        console.log(`   Contract address: ${deployment.contractAddress}`);

        // Broadcast
        console.log('\n📤 Broadcasting...');
        const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
        const fundingTxId = fundingResult.result || JSON.stringify(fundingResult);
        console.log(`   Funding TX: ${fundingTxId}`);
        if (!fundingResult.success) {
            console.error(`   ⚠️  Funding TX error: ${fundingResult.error}`);
        }

        const deployResult = await provider.sendRawTransaction(deployment.transaction[1], false);
        const deployTxId = deployResult.result || JSON.stringify(deployResult);
        console.log(`   Deploy TX: ${deployTxId}`);
        if (!deployResult.success) {
            console.error(`   ⚠️  Deploy TX error: ${deployResult.error}`);
        }

        // Done!
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 DEPLOYMENT SUCCESSFUL!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('Token Name:    ', name);
        console.log('Token Symbol:  ', symbol);
        console.log('Decimals:      ', decimals);
        console.log('Contract:      ', deployment.contractAddress);
        console.log('Deploy TX:     ', deployTxId);
        console.log('\n');

        // Save to deployed.json
        const configPath = path.join(__dirname, 'deployed.json');
        const config = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : {};
        if (!config.tokens) config.tokens = [];

        config.tokens.push({
            name,
            symbol,
            decimals,
            maxSupply: supply,
            contractAddress: deployment.contractAddress,
            txHash: deployTxId,
            network,
            deployedAt: new Date().toISOString()
        });

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ Saved to: ${configPath}`);

    } catch (error) {
        console.error('\n❌ Deployment failed:', error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }

    await provider.close();
}

main();
