#!/usr/bin/env node
/**
 * BitLaunch Post-Deploy Initialization
 *
 * Calls setter methods on deployed contracts (setTemplate, setPlatformWallet).
 * Uses proper ABIDataTypes from the opnet SDK.
 *
 * Usage:
 *   cd contracts
 *   MNEMONIC="your seed phrase" node init-contracts.js --network testnet
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
    networks: {
        mainnet: { rpc: 'https://mainnet.opnet.org' },
        testnet: { rpc: 'https://testnet.opnet.org' },
        regtest: { rpc: 'https://regtest.opnet.org' }
    },
    feeRate: 10,
    gasSatFee: 50000n,
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
    return { network: params.network || 'regtest' };
}

async function main() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 BitLaunch Post-Deploy Initialization');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { network } = parseArgs();

    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('❌ MNEMONIC env not set');
        process.exit(1);
    }

    // Load deployed.json
    const deployedPath = path.join(__dirname, 'deployed.json');
    if (!fs.existsSync(deployedPath)) {
        console.error('❌ deployed.json not found. Run deploy-contracts.js first.');
        process.exit(1);
    }
    const deployed = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    const contracts = deployed.contracts || {};

    // Dynamic imports
    console.log('📦 Loading modules...');
    const opnet = await import('opnet');
    const tx = await import('@btc-vision/transaction');
    const btc = await import('@btc-vision/bitcoin');

    const { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } = opnet;
    const { TransactionFactory, Mnemonic, BinaryWriter, AddressTypes, MLDSASecurityLevel } = tx;
    const { networks } = btc;

    const networkMap = { mainnet: networks.bitcoin, testnet: networks.opnetTestnet, regtest: networks.regtest };
    const btcNetwork = networkMap[network] || networks.regtest;
    const networkConfig = CONFIG.networks[network];

    const provider = new JSONRpcProvider({ url: networkConfig.rpc, network: btcNetwork });
    console.log(`Network: ${network}`);
    console.log(`RPC: ${networkConfig.rpc}`);

    const wallet = new Mnemonic(
        mnemonic, '', btcNetwork, MLDSASecurityLevel.LEVEL2
    ).deriveOPWallet(AddressTypes.P2TR, 0);

    console.log(`Wallet: ${wallet.p2tr}`);

    // Refresh UTXOs
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    console.log(`UTXOs: ${utxos.length}, Balance: ${utxos.reduce((s, u) => s + u.value, 0n)} sats`);

    if (utxos.length === 0) {
        console.error('❌ No UTXOs available.');
        process.exit(1);
    }

    // Build proper ABI for setter methods using ABIDataTypes
    function buildSetterAbi(methodName) {
        return [
            {
                name: methodName,
                inputs: [{ name: 'newValue', type: ABIDataTypes.ADDRESS }],
                outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
                type: BitcoinAbiTypes.Function,
            },
        ];
    }

    // Helper to call a setter
    async function callSetter(contractBech32, methodName, targetBech32, label) {
        console.log(`\n  📞 ${label}`);
        console.log(`     Contract: ${contractBech32}`);
        console.log(`     Target:   ${targetBech32}`);

        try {
            // Resolve target address
            const resolvedTarget = await provider.getPublicKeyInfo(targetBech32, targetBech32.startsWith('opt1sq'));
            if (!resolvedTarget) {
                console.error(`     ❌ Could not resolve target: ${targetBech32}`);
                return false;
            }

            const abi = buildSetterAbi(methodName);
            const contract = getContract(
                contractBech32,
                abi,
                provider,
                btcNetwork,
                wallet.address,
            );

            console.log(`     Simulating ${methodName}...`);
            const sim = await contract[methodName](resolvedTarget);
            if (sim.revert) {
                console.error(`     ❌ Reverted: ${sim.revert}`);
                return false;
            }

            console.log(`     Broadcasting...`);
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
            console.log(`     ✅ TX: ${receipt.transactionId}`);

            // Wait a bit between calls
            await new Promise(r => setTimeout(r, 3000));
            return true;
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
            return false;
        }
    }

    // ── Initialization Steps ──

    // 1. OP20Factory.setTemplate(OP20Template address)
    if (contracts.factory && contracts.template) {
        await callSetter(
            contracts.factory.contractAddress,
            'setTemplate',
            contracts.template.contractAddress,
            'OP20Factory → setTemplate(OP20Template)'
        );
    }

    // 2. PresaleFactory.setTemplate(Presale template address)
    if (contracts.presaleFactory && contracts.presale) {
        await callSetter(
            contracts.presaleFactory.contractAddress,
            'setTemplate',
            contracts.presale.contractAddress,
            'PresaleFactory → setTemplate(Presale)'
        );
    }

    // 3. PresaleFactory.setPlatformWallet(deployer)
    if (contracts.presaleFactory) {
        await callSetter(
            contracts.presaleFactory.contractAddress,
            'setPlatformWallet',
            wallet.p2tr,
            'PresaleFactory → setPlatformWallet(deployer)'
        );
    }

    // 4. LiquidityLock.setPlatformWallet(deployer)
    if (contracts.lock) {
        await callSetter(
            contracts.lock.contractAddress,
            'setPlatformWallet',
            wallet.p2tr,
            'LiquidityLock → setPlatformWallet(deployer)'
        );
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Post-Deploy Initialization Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await provider.close();
}

main().catch(err => {
    console.error('\n❌ Fatal:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
