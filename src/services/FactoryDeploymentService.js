// BitLaunch - Factory Deployment Service (V2)
// Deploy tokens via the OP20 Factory contract using the 11-param deployToken
// V2 changes: added freeMintUserCap, burnEnabled params
/* global BigInt */

import { getContract } from 'opnet';
import { CONTRACTS } from './contracts';
import { FACTORY_ABI } from './abis/factoryAbi';
import { registerToken } from './tokenRegistry';

/**
 * FactoryDeploymentService - Deploy OP20 tokens via Factory Contract
 *
 * V2 official 11-param deployToken:
 * maxSupply, decimals, name, symbol, initialMintTo, initialMintAmount,
 * freeMintSupply, freeMintPerTx, freeMintUserCap, burnEnabled, tokenOwner
 */
class FactoryDeploymentService {

    getFactory(provider, btcNetwork, senderAddress) {
        const factoryAddress = CONTRACTS.factory;

        if (!factoryAddress) {
            throw new Error(
                'Factory contract address not configured.\n\n' +
                'Set VITE_CONTRACT_FACTORY in your .env file.'
            );
        }

        if (!provider) {
            throw new Error('No provider available. Connect your wallet first.');
        }

        return getContract(factoryAddress, FACTORY_ABI, provider, btcNetwork, senderAddress);
    }

    /**
     * Deploy token via Factory contract (V2 — 11 params).
     */
    async deployToken(params, walletState) {
        this.validateParams(params);

        const { address, opAddress, provider, btcNetwork, network } = walletState;

        if (!address) throw new Error('Wallet not connected');

        console.log('Deploying token via Factory contract (V2)...');
        console.log('Token:', params.name, `(${params.symbol})`);

        try {
            const factory = this.getFactory(provider, btcNetwork, opAddress);

            const decimalsMultiplier = BigInt(10 ** params.decimals);
            const maxSupply = BigInt(params.totalSupply) * decimalsMultiplier;
            const initialMintAmount = params.preMintAmount
                ? BigInt(params.preMintAmount) * decimalsMultiplier
                : maxSupply;
            const freeMintSupply = BigInt(params.freeMintSupply || 0) * decimalsMultiplier;
            const freeMintPerTx = BigInt(params.freeMintPerTx || 0) * decimalsMultiplier;
            const freeMintUserCap = BigInt(params.freeMintUserCap || 0) * decimalsMultiplier;
            const burnEnabled = params.burnEnabled || false;

            // V2: 11-param deployToken call
            // ABI order: maxSupply, decimals, name, symbol, initialMintTo,
            //   initialMintAmount, freeMintSupply, freeMintPerTx, freeMintUserCap,
            //   tokenOwner, burnEnabled
            const simulation = await factory.deployToken(
                maxSupply,
                params.decimals,
                params.name,
                params.symbol,
                opAddress,
                initialMintAmount,
                freeMintSupply,
                freeMintPerTx,
                freeMintUserCap,
                opAddress,
                burnEnabled,
            );

            if (simulation.revert) {
                throw new Error(`Simulation failed: ${simulation.revert}`);
            }

            // Extract token address from TokenDeployed event
            let tokenAddress = null;
            console.log('Simulation result keys:', Object.keys(simulation));
            console.log('Simulation events:', JSON.stringify(simulation.events, (k, v) =>
                typeof v === 'bigint' ? v.toString() : v, 2));
            console.log('Simulation result:', simulation.result);

            if (simulation.events && simulation.events.length > 0) {
                for (const event of simulation.events) {
                    console.log('Event:', event.type || event.name, 'properties:', event.properties, 'values:', event.values);
                    const eName = event.type || event.name || '';
                    if (eName === 'TokenDeployed') {
                        // ABI defines field as "tokenAddress", but also try "token" as fallback
                        tokenAddress = event.properties?.tokenAddress
                            || event.properties?.token
                            || event.values?.tokenAddress
                            || event.values?.token;
                        break;
                    }
                }
            }

            // Fallback: check simulation.result for an address-like value
            if (!tokenAddress && simulation.result) {
                const res = simulation.result;
                // If result is an object with a p2op / toHex method, it might be the deployed address
                if (res && typeof res === 'object' && (res.p2op || res.toHex)) {
                    tokenAddress = res;
                    console.log('Token address from simulation.result:', tokenAddress);
                }
            }

            // Fallback: scan all events for any event with an ADDRESS-like field
            if (!tokenAddress && simulation.events && simulation.events.length > 0) {
                for (const event of simulation.events) {
                    const props = event.properties || event.values || {};
                    for (const [key, val] of Object.entries(props)) {
                        if (val && typeof val === 'object' && (val.p2op || val.toHex) && key !== 'deployer' && key !== 'operator' && key !== 'from') {
                            console.log(`Fallback: found address in event.${key}:`, val);
                            tokenAddress = val;
                            break;
                        }
                    }
                    if (tokenAddress) break;
                }
            }

            if (tokenAddress) {
                try {
                    const tokenAddrHex = tokenAddress.toHex ? tokenAddress.toHex() : null;
                    const tokenAddrStr = typeof tokenAddress === 'string'
                        ? tokenAddress
                        : tokenAddress.p2op
                            ? tokenAddress.p2op(btcNetwork)
                            : tokenAddress.toString();

                    if (tokenAddrStr && tokenAddrHex) {
                        registerToken(tokenAddrStr, tokenAddrHex);
                    }

                    tokenAddress = tokenAddrStr;
                } catch (e) {
                    console.warn('p2op conversion failed:', e.message);
                    tokenAddress = tokenAddress.toHex ? tokenAddress.toHex() : tokenAddress.toString();
                }
            }

            console.log('Simulation successful, requesting wallet signature...');
            console.log('Token address from simulation:', tokenAddress);

            const FEE_ADDRESS = import.meta.env.VITE_PLATFORM_WALLET;
            const FEE_AMOUNT = 10000;

            // Wrap sendTransaction separately — the wallet may broadcast
            // successfully but the SDK can still throw (e.g. UTXO race).
            // We must still return the token address from the simulation.
            let txHash = null;
            try {
                const result = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: address,
                    feeRate: 10,
                    maximumAllowedSatToSpend: 100000n,
                    network: btcNetwork,
                    ...(FEE_ADDRESS ? {
                        optionalOutputs: [{
                            address: FEE_ADDRESS,
                            value: FEE_AMOUNT,
                        }],
                    } : {}),
                });
                txHash = result.transactionId || result.txHash || result.result;
            } catch (sendError) {
                console.warn('sendTransaction error (tx may still have been broadcast):', sendError.message);
                // If the wallet signed & broadcast but verification failed,
                // we still have the token address from simulation — return partial success.
                return {
                    success: true,
                    txHash: null,
                    tokenAddress: tokenAddress ? tokenAddress.toString() : null,
                    params,
                    warning: `Transaction may have been sent but could not be verified: ${sendError.message}`,
                };
            }

            return {
                success: true,
                txHash,
                tokenAddress: tokenAddress ? tokenAddress.toString() : null,
                params,
            };

        } catch (error) {
            console.error('Factory deployment failed:', error);

            if (error.message.includes('not configured') || error.message.includes('not connected')) {
                throw error;
            }
            if (error.message.includes('rejected') || error.message.includes('cancelled')) {
                throw new Error('Transaction rejected by user');
            }

            throw new Error(
                `Factory deployment failed: ${error.message}\n\n` +
                'Make sure:\n' +
                '1. OPWallet is connected\n' +
                '2. You have enough satoshis for fees\n' +
                '3. Factory contract is deployed on this network'
            );
        }
    }

    validateParams(params) {
        if (!params.name || params.name.length < 1 || params.name.length > 50) {
            throw new Error('Token name must be 1-50 characters');
        }
        if (!params.symbol || params.symbol.length < 1 || params.symbol.length > 10) {
            throw new Error('Symbol must be 1-10 characters');
        }
        if (params.decimals < 0 || params.decimals > 18) {
            throw new Error('Decimals must be 0-18');
        }
        if (!params.totalSupply || params.totalSupply <= 0) {
            throw new Error('Total supply must be greater than 0');
        }
    }
}

export const factoryDeploymentService = new FactoryDeploymentService();
export default FactoryDeploymentService;
