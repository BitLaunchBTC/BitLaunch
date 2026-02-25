// BitLaunch - Shared OPNet Provider Utility
// Centralized provider and network configuration for all services.
//
// PRIMARY: Uses provider/network from @btc-vision/walletconnect (set via setWalletProvider)
// FALLBACK: Creates its own JSONRpcProvider for read-only operations when wallet is not connected

import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { NETWORK } from './contracts';
import { clearAddressCache } from './addressHelper';

const NETWORK_CONFIG = {
    mainnet: {
        btcNetwork: networks.bitcoin,
        rpcUrl: 'https://api.opnet.org',
    },
    testnet: {
        btcNetwork: networks.opnetTestnet,
        rpcUrl: 'https://testnet.opnet.org',
    },
    regtest: {
        btcNetwork: networks.regtest,
        rpcUrl: 'https://regtest.opnet.org',
    },
};

class OPNetProvider {
    constructor() {
        this.network = NETWORK || 'testnet';
        this.btcNetwork = null;
        this.provider = null;
        // Wallet-provided values take priority
        this._walletProvider = null;
        this._walletNetwork = null;
    }

    /**
     * Set the wallet-connect provider/network.
     * Called from WalletContext when wallet connects/changes network.
     * All services that call getProvider()/getNetwork() will use these values.
     */
    setWalletProvider(provider, btcNetwork) {
        this._walletProvider = provider;
        this._walletNetwork = btcNetwork;
        if (btcNetwork) {
            clearAddressCache();
        }
    }

    /**
     * Clear wallet provider (on disconnect).
     */
    clearWalletProvider() {
        this._walletProvider = null;
        this._walletNetwork = null;
    }

    /**
     * Initialize fallback provider (used when wallet is not connected).
     */
    _initFallback() {
        const networkKey = NETWORK || 'testnet';
        this.network = networkKey;
        const config = NETWORK_CONFIG[networkKey] || NETWORK_CONFIG.testnet;
        this.btcNetwork = config.btcNetwork;
        this.provider = new JSONRpcProvider({ url: config.rpcUrl, network: this.btcNetwork });
    }

    /**
     * Get the active provider.
     * Prefers wallet-connected provider; falls back to self-created one.
     */
    getProvider() {
        if (this._walletProvider) return this._walletProvider;
        if (!this.provider) this._initFallback();
        return this.provider;
    }

    /**
     * Get the active Bitcoin network object.
     * Prefers wallet-connected network; falls back to env-configured one.
     */
    getNetwork() {
        if (this._walletNetwork) return this._walletNetwork;
        if (!this.btcNetwork) this._initFallback();
        return this.btcNetwork;
    }

    getNetworkName() {
        return this.network;
    }

    // Legacy init() — kept for backward compat but no longer primary path
    init(network) {
        // No-op when wallet provider is active
        if (this._walletProvider) return this;
        this._initFallback();
        return this;
    }
}

export const opnetProvider = new OPNetProvider();
export default opnetProvider;
