// BitLaunch - Network Status Component with Real OPNet Stats
import React, { useState, useEffect, useCallback } from 'react';

const NetworkStatus = ({ network = 'regtest' }) => {
    const [blockHeight, setBlockHeight] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [loading, setLoading] = useState(true);

    const getRpcUrl = (net) => {
        const urls = {
            'mainnet': 'https://api.opnet.org',
            'bitcoin': 'https://api.opnet.org',
            'testnet': 'https://testnet.opnet.org',
            'regtest': 'https://regtest.opnet.org'
        };
        return urls[net] || urls.regtest;
    };

    const fetchBlockHeight = useCallback(async () => {
        const rpcUrl = getRpcUrl(network);

        try {
            // Method 1: Direct JSON-RPC call for block height
            const response = await fetch(`${rpcUrl}/api/v1/json-rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'btc_blockNumber',
                    params: []
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.result !== undefined) {
                    // Result could be hex or number
                    const height = typeof data.result === 'string' && data.result.startsWith('0x')
                        ? parseInt(data.result, 16)
                        : Number(data.result);

                    setBlockHeight(height);
                    setIsConnected(true);
                    setLoading(false);
                    return;
                }
            }

            // Method 2: Try alternative endpoint
            const altResponse = await fetch(`${rpcUrl}/api/v1/json-rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'getBlockHeight',
                    params: {}
                })
            });

            if (altResponse.ok) {
                const altData = await altResponse.json();
                if (altData.result !== undefined) {
                    const height = Number(altData.result);
                    setBlockHeight(height);
                    setIsConnected(true);
                    setLoading(false);
                    return;
                }
            }

            // Method 3: Try status endpoint
            const statusResponse = await fetch(`${rpcUrl}/api/v1/status`);
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.blockHeight || statusData.height || statusData.block) {
                    const height = Number(statusData.blockHeight || statusData.height || statusData.block);
                    setBlockHeight(height);
                    setIsConnected(true);
                    setLoading(false);
                    return;
                }
            }

            // If we get here, connection works but couldn't get height
            setIsConnected(true);
            setLoading(false);

        } catch (error) {
            console.warn('NetworkStatus: Failed to fetch block height:', error.message);
            setIsConnected(false);
            setLoading(false);
        }
    }, [network]);

    useEffect(() => {
        fetchBlockHeight();

        // Refresh every 10 seconds
        const interval = setInterval(fetchBlockHeight, 10000);

        return () => clearInterval(interval);
    }, [fetchBlockHeight]);

    const formatBlockHeight = (height) => {
        if (height === null) return loading ? '...' : '---';
        return height.toLocaleString();
    };

    return (
        <div className="network-status">
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <div className="status-info">
                <div className="status-row">
                    <span className="status-label">Network</span>
                    <span className="status-value">{network}</span>
                </div>
                <div className="status-row">
                    <span className="status-label">Block</span>
                    <span className="status-value block-height">
                        {formatBlockHeight(blockHeight)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default NetworkStatus;
