// BitLaunch - Wallet Context (Compatibility wrapper around @btc-vision/walletconnect)
//
// This wraps the official useWalletConnect() hook and exposes the same
// useWallet() API that all our components already import.
// The actual WalletConnectProvider is mounted in App.jsx.
//
// IMPORTANT: The wallet may report BITCOIN_REGTEST even when on OPNet testnet,
// causing walletconnect to use networks.regtest (bech32Opnet='opr') instead of
// networks.opnetTestnet (bech32='opt'). We override the network object based on
// VITE_NETWORK from .env, which is the authoritative source for where contracts
// are deployed. The wallet-provided provider still connects to the correct RPC.

import React, { createContext, useContext, useCallback, useEffect, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import { opnetProvider } from '../services/opnetProvider';
import { NETWORK as ENV_NETWORK } from '../services/contracts';

const WalletContext = createContext(null);

/**
 * Map VITE_NETWORK env var to the correct btcNetwork object.
 * This is the authoritative network for deployed contracts.
 */
const ENV_BTC_NETWORK_MAP = {
    mainnet: networks.bitcoin,
    testnet: networks.opnetTestnet,
    regtest: networks.regtest,
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within WalletProvider');
    }
    return context;
};

/**
 * WalletProvider — thin adapter over useWalletConnect().
 * Maps official wallet-connect state to the API our components expect.
 * Overrides network object to match VITE_NETWORK (where contracts are deployed).
 */
export const WalletProvider = ({ children }) => {
    const wc = useWalletConnect();

    // Use VITE_NETWORK as the authoritative network for getContract calls.
    // The wallet may report BITCOIN_REGTEST when actually on OPNet testnet,
    // causing address prefix mismatch (opr vs opt). The .env knows where
    // contracts are deployed, so use that network object.
    const networkName = ENV_NETWORK || 'testnet';
    const btcNetwork = useMemo(() => {
        const envNet = ENV_BTC_NETWORK_MAP[networkName];
        if (envNet) return envNet;
        // Fallback to wallet-reported network if env not set
        return wc.network || networks.opnetTestnet;
    }, [networkName, wc.network]);

    // Sync wallet-connect provider + correct network into opnetProvider singleton
    // so all services (PresaleService, VestingService, etc.) use the correct one
    useEffect(() => {
        if (wc.provider) {
            opnetProvider.setWalletProvider(wc.provider, btcNetwork);
        } else {
            opnetProvider.clearWalletProvider();
        }
    }, [wc.provider, btcNetwork]);

    // Connect via OP_WALLET specifically (official OPNet wallet)
    const connect = useCallback(() => {
        wc.openConnectModal();
    }, [wc]);

    const disconnect = useCallback(() => {
        wc.disconnect();
        opnetProvider.clearWalletProvider();
    }, [wc]);

    const formatAddress = (addr) => {
        if (!addr) return '';
        return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
    };

    const value = {
        // State
        wallet: wc.walletInstance,
        address: wc.walletAddress,          // bech32 string (opt1p... / bc1p...)
        opAddress: wc.address,              // Address object (for getContract sender)
        network: networkName,               // string: 'mainnet' | 'testnet' | 'regtest'
        btcNetwork: btcNetwork,             // Network object from VITE_NETWORK (for getContract)
        provider: wc.provider,              // AbstractRpcProvider (for getContract)
        publicKey: wc.publicKey,
        mldsaPublicKey: wc.mldsaPublicKey,
        hashedMLDSAKey: wc.hashedMLDSAKey,
        connecting: wc.connecting,
        connected: !!wc.walletAddress,
        walletBalance: wc.walletBalance,

        // Methods
        connect,
        disconnect,
        formatAddress,
        openConnectModal: wc.openConnectModal,
        connectToWallet: wc.connectToWallet,
    };

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
};

export default WalletContext;
