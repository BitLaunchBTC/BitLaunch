#!/usr/bin/env node
/**
 * BitLaunch Post-Deploy Initialization
 *
 * Calls setter methods on deployed contracts to set template/platformWallet.
 * Required because regtest node delivers 0 bytes to onDeployment().
 *
 * Usage:
 *   cd contracts
 *   MNEMONIC="your seed phrase" node post-deploy-init.js
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 BitLaunch Post-Deploy Initialization');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('❌ MNEMONIC not set');
        process.exit(1);
    }

    // Load deployed addresses
    const deployedPath = path.join(__dirname, 'deployed.json');
    if (!fs.existsSync(deployedPath)) {
        console.error('❌ deployed.json not found. Deploy contracts first.');
        process.exit(1);
    }
    const deployed = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    const contracts = deployed.contracts;

    // Dynamic imports
    const { JSONRpcProvider, getContract } = await import('opnet');
    const { Mnemonic, AddressTypes, MLDSASecurityLevel, ABIDataTypes } = await import('@btc-vision/transaction');
    const { networks } = await import('@btc-vision/bitcoin');

    const networkName = process.env.NETWORK || 'testnet';
    const networkMap = { mainnet: networks.bitcoin, testnet: networks.opnetTestnet, regtest: networks.regtest };
    const btcNetwork = networkMap[networkName] || networks.opnetTestnet;
    const rpcMap = { mainnet: 'https://api.opnet.org', testnet: 'https://testnet.opnet.org', regtest: 'https://regtest.opnet.org' };
    const provider = new JSONRpcProvider({ url: rpcMap[networkName], network: btcNetwork });

    const wallet = new Mnemonic(
        mnemonic, '', btcNetwork, MLDSASecurityLevel.LEVEL2
    ).deriveOPWallet(AddressTypes.P2TR, 0);

    console.log(`Deployer: ${wallet.p2tr}`);

    // Build ABI for setter methods
    function buildSetterAbi(methodName) {
        return [
            {
                name: methodName,
                type: 'function',  // BitcoinAbiTypes.Function = "function"
                inputs: [{ name: 'newValue', type: ABIDataTypes.ADDRESS }],
                outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
            },
        ];
    }

    // Get UTXOs
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    console.log(`UTXOs: ${utxos.length}, Balance: ${utxos.reduce((s, u) => s + u.value, 0n)} sats\n`);

    // Steps to execute
    const steps = [
        {
            label: 'OP20Factory.setTemplate(OP20Template)',
            contractAddr: contracts.factory?.contractAddress,
            method: 'setTemplate',
            targetAddr: contracts.template?.contractAddress,
        },
        {
            label: 'PresaleFactory.setTemplate(Presale)',
            contractAddr: contracts.presaleFactory?.contractAddress,
            method: 'setTemplate',
            targetAddr: contracts.presale?.contractAddress,
        },
        {
            label: 'PresaleFactory.setPlatformWallet(deployer)',
            contractAddr: contracts.presaleFactory?.contractAddress,
            method: 'setPlatformWallet',
            targetAddr: wallet.p2tr,
        },
        {
            label: 'LiquidityLock.setPlatformWallet(deployer)',
            contractAddr: contracts.lock?.contractAddress,
            method: 'setPlatformWallet',
            targetAddr: wallet.p2tr,
        },
    ];

    for (const step of steps) {
        if (!step.contractAddr || !step.targetAddr) {
            console.log(`⏭️  Skipping ${step.label} — missing address`);
            continue;
        }

        console.log(`\n📝 ${step.label}`);
        console.log(`   Contract: ${step.contractAddr}`);
        console.log(`   Target: ${step.targetAddr}`);

        try {
            // Resolve the target address
            let resolvedTarget;
            for (let attempt = 1; attempt <= 10; attempt++) {
                try {
                    const isContract = step.targetAddr.startsWith('opt1sq') || step.targetAddr.startsWith('opr1sq') || step.targetAddr.startsWith('bc1sq');
                    resolvedTarget = await provider.getPublicKeyInfo(step.targetAddr, isContract);
                } catch (e) { /* retry */ }
                if (resolvedTarget) break;
                console.log(`   Waiting for RPC to index... (attempt ${attempt}/10)`);
                await new Promise(r => setTimeout(r, 15000));
            }

            if (!resolvedTarget) {
                console.error(`   ❌ Could not resolve target: ${step.targetAddr}`);
                continue;
            }

            // Create contract instance with setter ABI
            const abi = buildSetterAbi(step.method);
            const contract = getContract(
                step.contractAddr,
                abi,
                provider,
                btcNetwork,
                wallet.address,
            );

            // Simulate
            console.log(`   Simulating ${step.method}...`);
            const sim = await contract[step.method](resolvedTarget);

            if (sim.revert) {
                console.warn(`   ⚠️  Reverted: ${sim.revert}`);
                continue;
            }

            console.log(`   Simulation OK. Sending transaction...`);

            // Send
            const receipt = await sim.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                refundTo: wallet.p2tr,
                feeRate: 10,
                maximumAllowedSatToSpend: 100000n,
                network: btcNetwork,
                utxos: utxos,
            });

            utxos = receipt.newUTXOs || utxos;
            console.log(`   ✅ TX: ${receipt.transactionId}`);

            // Wait between calls
            await new Promise(r => setTimeout(r, 3000));

        } catch (err) {
            console.error(`   ❌ Failed: ${err.message}`);
            if (err.stack) console.error(`   ${err.stack.split('\n')[1]}`);
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Post-deploy initialization complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await provider.close();
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
