#!/usr/bin/env node
/**
 * BitLaunch Contract Deployer
 * 
 * Deploys Vesting and LiquidityLock contracts to OPNet.
 * The deployer's own address is used as the platform fee wallet.
 * 
 * Usage:
 *   cd contracts
 *   $env:MNEMONIC="your seed phrase here"
 *   node deploy-contracts.js --network regtest
 *   node deploy-contracts.js --network regtest --contract lock
 *   node deploy-contracts.js --network regtest --contract vesting
 *   node deploy-contracts.js --network regtest --contract factory --template <tokenAddr>
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ──
const CONFIG = {
    networks: {
        mainnet: { rpc: 'https://mainnet.opnet.org' },
        testnet: { rpc: 'https://testnet.opnet.org' },
        regtest: { rpc: 'https://regtest.opnet.org' }
    },
    feeRate: 10,
    gasSatFee: 50000n,
    contracts: {
        template: {
            wasm: 'build/OP20Template.wasm',
            name: 'OP20Template',
            calldataType: 'none'
        },
        factory: {
            wasm: 'build/Factory.wasm',
            name: 'OP20Factory',
            calldataType: 'templateOnly',
            postDeploy: [{ method: 'setTemplate', type: 'templateAddress' }]
        },
        presale: {
            wasm: 'build/Presale.wasm',
            name: 'Presale',
            calldataType: 'none'
        },
        presaleFactory: {
            wasm: 'build/PresaleFactory.wasm',
            name: 'PresaleFactory',
            calldataType: 'templateAndPlatformWallet',
            postDeploy: [
                { method: 'setTemplate', type: 'presaleTemplateAddress' },
                { method: 'setPlatformWallet', type: 'platformWallet' }
            ]
        },
        vesting: {
            wasm: 'build/Vesting.wasm',
            name: 'Vesting',
            calldataType: 'none'
        },
        lock: {
            wasm: 'build/LiquidityLock.wasm',
            name: 'LiquidityLock',
            calldataType: 'platformWallet',
            postDeploy: [{ method: 'setPlatformWallet', type: 'platformWallet' }]
        },
        airdrop: {
            wasm: 'build/Airdrop.wasm',
            name: 'Airdrop',
            calldataType: 'none'
        }
    }
};

/**
 * Build a minimal ABI for a setter method that takes one ADDRESS param.
 * This matches the pattern: setTemplate(address), setPlatformWallet(address)
 */
function buildSetterAbi(methodName) {
    return [
        {
            name: methodName,
            inputs: [{ name: 'newValue', type: 'ADDRESS' }],
            outputs: [{ name: 'success', type: 'BOOL' }],
            type: 'Function',
        },
    ];
}

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
        contract: params.contract || 'all',
        template: params.template || '',  // token address for factory
    };
}

async function main() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 BitLaunch Contract Deployer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const opts = parseArgs();
    const { network, contract } = opts;

    // Check mnemonic
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('❌ Error: MNEMONIC environment variable not set');
        console.error('   PowerShell: $env:MNEMONIC="your twelve word seed phrase"');
        process.exit(1);
    }

    if (network === 'mainnet') {
        console.error('❌ Mainnet deployment disabled for safety.');
        process.exit(1);
    }

    // Dynamic imports
    console.log('📦 Loading modules...');
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
        console.error('   Run: npm install');
        process.exit(1);
    }

    // Setup
    const networkConfig = CONFIG.networks[network] || CONFIG.networks.regtest;
    const networkMap = { mainnet: networks.bitcoin, bitcoin: networks.bitcoin, testnet: networks.opnetTestnet, regtest: networks.regtest };
    const btcNetwork = networkMap[network] || networks.regtest;
    const provider = new JSONRpcProvider({ url: networkConfig.rpc, network: btcNetwork });
    const factory = new TransactionFactory();

    console.log(`Network: ${network}`);
    console.log(`RPC: ${networkConfig.rpc}`);

    // Create wallet using deriveOPWallet (correct API for this SDK version)
    const wallet = new Mnemonic(
        mnemonic, '', btcNetwork, MLDSASecurityLevel.LEVEL2
    ).deriveOPWallet(AddressTypes.P2TR, 0);

    console.log(`Deployer: ${wallet.p2tr}`);
    console.log(`Platform fee wallet: ${wallet.p2tr} (deployer = platform owner)`);

    // Get UTXOs
    console.log('\n📡 Fetching UTXOs...');
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

    if (utxos.length === 0) {
        console.error('❌ No UTXOs. Fund your wallet first.');
        console.error(`   Address: ${wallet.p2tr}`);
        process.exit(1);
    }

    const balance = utxos.reduce((sum, u) => sum + u.value, 0n);
    console.log(`   UTXOs: ${utxos.length}, Balance: ${balance} sats`);

    // Determine which contracts to deploy
    const contractsToDeploy = contract === 'all'
        ? Object.keys(CONFIG.contracts)
        : [contract];

    const deployed = {};

    for (const contractKey of contractsToDeploy) {
        const contractConfig = CONFIG.contracts[contractKey];
        if (!contractConfig) {
            console.error(`❌ Unknown contract: ${contractKey}. Valid: factory, presale, vesting, lock`);
            continue;
        }

        const wasmPath = path.join(__dirname, contractConfig.wasm);

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🚀 Deploying: ${contractConfig.name}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        if (!fs.existsSync(wasmPath)) {
            console.error(`❌ WASM not found: ${wasmPath}`);
            console.error('   Run: npm run build:all');
            continue;
        }

        const bytecode = fs.readFileSync(wasmPath);
        console.log(`📦 Bytecode: ${bytecode.length} bytes`);

        // Build calldata based on contract type
        let calldata = undefined;

        // Helper: resolve a bech32 address to 32-byte Address via RPC
        async function resolveAddr(bech32Addr, label) {
            console.log(`   Resolving ${label}: ${bech32Addr}`);
            let resolved;
            for (let attempt = 1; attempt <= 12; attempt++) {
                try {
                    resolved = await provider.getPublicKeyInfo(bech32Addr, true);
                } catch (e) {
                    // ignore RPC errors during indexing
                }
                if (resolved) break;
                console.log(`   Waiting for RPC to index ${label} (attempt ${attempt}/12)...`);
                await new Promise(r => setTimeout(r, 20000));
            }
            if (!resolved) {
                throw new Error(`Could not resolve ${label}: ${bech32Addr}`);
            }
            console.log(`   ${label} resolved`);
            return resolved;
        }

        // On regtest, onDeployment() receives 0 bytes (known node bug).
        // All contracts handle this — they set owner from tx.origin and
        // leave template/platformWallet empty until post-deploy setters.
        // So we skip calldata entirely and rely on post-deploy init.
        if (contractConfig.calldataType !== 'none') {
            console.log('📝 Skipping calldata (regtest node delivers 0 bytes to onDeployment)');
            console.log('   Will use post-deploy setter methods instead.');
        }

        try {
            console.log('🔐 Getting challenge...');
            const challenge = await provider.getChallenge();

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
                calldata: calldata ? calldata : undefined,
                challenge: challenge,
                linkMLDSAPublicKeyToAddress: true,
                revealMLDSAPublicKey: true
            };

            const deployment = await factory.signDeployment(deploymentParams);

            console.log(`✅ Contract address: ${deployment.contractAddress}`);

            // Broadcast
            console.log('📤 Broadcasting...');
            const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
            const fid = fundingResult.result || JSON.stringify(fundingResult);
            console.log(`   Funding TX: ${fid}`);
            if (!fundingResult.success) {
                console.error(`   ⚠️  Funding TX error: ${fundingResult.error}`);
            }

            const deployResult = await provider.sendRawTransaction(deployment.transaction[1], false);
            const did = deployResult.result || JSON.stringify(deployResult);
            console.log(`   Deploy TX: ${did}`);
            if (!deployResult.success) {
                console.error(`   ⚠️  Deploy TX error: ${deployResult.error}`);
            }

            console.log(`\n🎉 ${contractConfig.name} deployed!`);

            deployed[contractKey] = {
                name: contractConfig.name,
                contractAddress: deployment.contractAddress,
                txHash: did
            };

            utxos = deployment.utxos;

            if (contractsToDeploy.indexOf(contractKey) < contractsToDeploy.length - 1) {
                console.log('\n⏳ Waiting 3s before next deployment...');
                await new Promise(r => setTimeout(r, 3000));
            }

        } catch (error) {
            console.error(`\n❌ Failed to deploy ${contractKey}:`, error.message);
            if (error.stack) console.error(error.stack);
        }
    }

    // ── Post-Deploy Initialization (regtest calldata workaround) ──
    // On regtest, onDeployment calldata may be 0 bytes (known node bug).
    // Call setter methods to configure template/platformWallet.
    const contractsNeedingInit = Object.entries(deployed).filter(
        ([key]) => CONFIG.contracts[key].postDeploy
    );
    if (contractsNeedingInit.length > 0) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔧 Post-Deploy Initialization');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('⏳ Waiting for block confirmation before post-deploy init...');
        console.log('   Contracts need to be mined before RPC can resolve them.');

        // Wait for block — poll getBlockNumber every 15s
        const startBlock = await provider.getBlockNumber();
        console.log(`   Current block: ${startBlock}`);
        for (let i = 0; i < 40; i++) { // up to 10 minutes
            await new Promise(r => setTimeout(r, 15000));
            const currentBlock = await provider.getBlockNumber();
            if (currentBlock > startBlock) {
                console.log(`   ✅ New block mined: ${currentBlock}`);
                break;
            }
            console.log(`   Still at block ${currentBlock}, waiting... (${(i + 1) * 15}s)`);
        }

        // Extra buffer after block confirmation
        console.log('   Waiting 10s more for RPC indexing...');
        await new Promise(r => setTimeout(r, 10000));

        // Refresh UTXOs after block
        utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
        console.log(`   Refreshed UTXOs: ${utxos.length}`);

        let { getContract } = await import('opnet');

        for (const [contractKey, deployResult] of contractsNeedingInit) {
            const contractConfig = CONFIG.contracts[contractKey];

            console.log(`\nConfiguring: ${deployResult.name} (${deployResult.contractAddress})`);

            for (const step of contractConfig.postDeploy) {
                try {
                    let targetAddr;
                    if (step.type === 'templateAddress') {
                        // OP20Template address for OP20Factory
                        const tplBech32 = opts.template || (deployed.template && deployed.template.contractAddress);
                        if (!tplBech32) { console.warn('   ⚠️  No template address, skipping setTemplate'); continue; }
                        targetAddr = tplBech32;
                    } else if (step.type === 'presaleTemplateAddress') {
                        // Presale template address for PresaleFactory
                        const tplBech32 = opts.template || (deployed.presale && deployed.presale.contractAddress);
                        if (!tplBech32) { console.warn('   ⚠️  No presale template, skipping setTemplate'); continue; }
                        targetAddr = tplBech32;
                    } else if (step.type === 'platformWallet') {
                        targetAddr = wallet.p2tr;
                    }

                    if (!targetAddr) continue;

                    // Resolve the target address to 32-byte internal Address
                    const resolvedTarget = await provider.getPublicKeyInfo(targetAddr, true);
                    if (!resolvedTarget) {
                        console.warn(`   ⚠️  Could not resolve ${step.type}: ${targetAddr}`);
                        continue;
                    }

                    // Build ABI calldata for the setter method
                    const writer = new BinaryWriter();
                    writer.writeAddress(resolvedTarget);

                    // Resolve the deployed contract address for interaction
                    const contractAddress = await provider.getPublicKeyInfo(deployResult.contractAddress, true);
                    if (!contractAddress) {
                        console.warn(`   ⚠️  Could not resolve contract: ${deployResult.contractAddress}`);
                        continue;
                    }

                    // Use getContract + simulate pattern
                    const abi = buildSetterAbi(step.method);
                    const contract = getContract(
                        deployResult.contractAddress,
                        abi,
                        provider,
                        btcNetwork,
                        wallet.address,
                    );

                    console.log(`   Calling ${step.method}(${targetAddr.slice(0, 20)}...)...`);
                    const sim = await contract[step.method](resolvedTarget);
                    if (sim.revert) {
                        console.warn(`   ⚠️  ${step.method} reverted: ${sim.revert}`);
                        continue;
                    }

                    const receipt = await sim.sendTransaction({
                        signer: wallet.keypair,
                        mldsaSigner: wallet.mldsaKeypair,
                        refundTo: wallet.p2tr,
                        feeRate: CONFIG.feeRate,
                        maximumAllowedSatToSpend: CONFIG.gasSatFee,
                        network: btcNetwork,
                        utxos: utxos,
                    });

                    utxos = receipt.newUTXOs || utxos;
                    console.log(`   ✅ ${step.method} TX: ${receipt.transactionId}`);
                    await new Promise(r => setTimeout(r, 3000));

                } catch (err) {
                    console.warn(`   ⚠️  ${step.method} failed: ${err.message}`);
                    console.warn('   You may need to call this setter manually after RPC indexes the contract.');
                }
            }
        }
    }

    // Save results
    if (Object.keys(deployed).length > 0) {
        const configPath = path.join(__dirname, 'deployed.json');
        const config = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : {};

        if (!config.contracts) config.contracts = {};

        for (const [key, result] of Object.entries(deployed)) {
            config.contracts[key] = {
                name: result.name,
                contractAddress: result.contractAddress,
                txHash: result.txHash,
                network: network,
                platformWallet: wallet.p2tr,
                deployedAt: new Date().toISOString()
            };
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 DEPLOYMENT SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        for (const [key, result] of Object.entries(deployed)) {
            console.log(`  ${result.name}: ${result.contractAddress}`);
        }

        console.log(`\n✅ Saved to: ${configPath}`);
    }

    await provider.close();
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
