// BitLaunch - Token Service for OP20 token info
// Uses provider/network from @btc-vision/walletconnect (passed in from component)
/* global BigInt */

import { getContract, OP_20_ABI } from 'opnet';

/**
 * TokenService - Handles OP20 token info lookups and validation.
 * Deployment is handled by FactoryDeploymentService.
 *
 * Provider and network are passed in from the component layer
 * (sourced from useWalletConnect via our useWallet wrapper).
 */
class TokenService {
    constructor() {
        this._provider = null;
        this._btcNetwork = null;
    }

    /**
     * Set the provider/network from wallet connect.
     * Call this before getTokenInfo if wallet state changed.
     */
    setWalletState(provider, btcNetwork) {
        this._provider = provider;
        this._btcNetwork = btcNetwork;
        return this;
    }

    /**
     * Validate token parameters before deployment
     */
    validateTokenParams(params) {
        const errors = {};

        if (!params.name || params.name.length < 1) {
            errors.name = 'Token name is required';
        } else if (params.name.length > 50) {
            errors.name = 'Token name too long (max 50 characters)';
        }

        if (!params.symbol || params.symbol.length < 1) {
            errors.symbol = 'Symbol is required';
        } else if (params.symbol.length > 10) {
            errors.symbol = 'Symbol too long (max 10 characters)';
        } else if (!/^[A-Z0-9]+$/.test(params.symbol.toUpperCase())) {
            errors.symbol = 'Symbol must be alphanumeric';
        }

        if (!params.totalSupply || params.totalSupply <= 0) {
            errors.totalSupply = 'Total supply must be greater than 0';
        } else if (params.totalSupply > Number.MAX_SAFE_INTEGER) {
            errors.totalSupply = 'Total supply too large';
        }

        if (params.decimals === undefined || params.decimals < 0 || params.decimals > 18) {
            errors.decimals = 'Decimals must be between 0 and 18';
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors
        };
    }

    /**
     * Get deployed token info from chain
     * @param {string} contractAddress - token contract address
     * @param {AbstractRpcProvider} [provider] - override provider (optional)
     * @param {Network} [btcNetwork] - override network (optional)
     */
    async getTokenInfo(contractAddress, provider, btcNetwork) {
        const p = provider || this._provider;
        const n = btcNetwork || this._btcNetwork;

        if (!p || !n) {
            console.warn('TokenService: No provider/network available');
            return null;
        }

        try {
            const contract = getContract(
                contractAddress,
                OP_20_ABI,
                p,
                n
            );

            const [nameResult, symbolResult, decimalsResult, totalSupplyResult] = await Promise.all([
                contract.name(),
                contract.symbol(),
                contract.decimals(),
                contract.totalSupply()
            ]);

            return {
                name: nameResult.properties?.name || 'Unknown',
                symbol: symbolResult.properties?.symbol || '???',
                decimals: Number(decimalsResult.properties?.decimals || 8),
                totalSupply: totalSupplyResult.properties?.totalSupply?.toString() || '0',
                contractAddress
            };
        } catch (error) {
            console.error('Failed to get token info:', error);
            return null;
        }
    }
}

export const tokenService = new TokenService();
export default TokenService;
