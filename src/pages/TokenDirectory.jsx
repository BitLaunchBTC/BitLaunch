// BitLaunch - Token Directory Page (V2)
// Browse all factory-deployed tokens
// Route: /explore/tokens
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import { factoryService } from '../services/FactoryService';
import { airdropService } from '../services/AirdropService';
import { opnetProvider } from '../services/opnetProvider';
import { getAllRegisteredTokens } from '../services/tokenRegistry';
import EmptyState from '../components/EmptyState';
import AddressDisplay from '../components/AddressDisplay';
import { Coins, Search, ArrowLeft, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import '../styles/directory.css';

const TokenDirectory = () => {
    const { address } = useWallet();
    const toast = useToast();
    useScrollAnimation();

    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const loadTokens = useCallback(async () => {
        setLoading(true);
        try {
            // Get all registered token addresses from local registry
            const allAddresses = getAllRegisteredTokens();
            const tokenList = [];

            for (const addr of allAddresses) {
                try {
                    const info = await airdropService.fetchTokenInfo(addr);
                    tokenList.push({
                        address: addr,
                        name: info.name || 'Unknown',
                        symbol: info.symbol || '???',
                        decimals: info.decimals || 8,
                    });
                } catch {
                    tokenList.push({
                        address: addr,
                        name: 'Unknown',
                        symbol: '???',
                        decimals: 8,
                    });
                }
            }

            setTokens(tokenList);
        } catch {
            setTokens([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleRefresh = async () => {
        if (!address) {
            toast.error('Connect wallet to sync tokens from chain');
            return;
        }
        setRefreshing(true);
        try {
            await factoryService.syncTokenRegistry(address);
            await loadTokens();
            toast.success('Token list refreshed');
        } catch {
            toast.error('Failed to sync tokens');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadTokens();
    }, [loadTokens]);

    const filteredTokens = searchQuery.trim()
        ? tokens.filter(t =>
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.address.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : tokens;

    const copyAddress = (addr) => {
        navigator.clipboard.writeText(addr)
            .then(() => toast.success('Address copied'))
            .catch(() => toast.error('Failed to copy'));
    };

    return (
        <div className="directory-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <Link to="/explore" className="back-btn flex items-center gap-sm mb-md" style={{ display: 'inline-flex' }}>
                        <ArrowLeft size={16} /> Back to Explore
                    </Link>
                    <div className="page-hero-icon orange">
                        <Coins size={28} />
                    </div>
                    <h1 className="page-hero-title">Token Directory</h1>
                    <p className="page-hero-subtitle">Browse all tokens deployed through BitLaunch.</p>
                </div>
            </section>

            <div className="directory-container">

                <div className="directory-toolbar animate-on-scroll">
                    <div className="directory-search">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            className="directory-search-input"
                            placeholder="Search by name, symbol, or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        className={`btn btn-secondary ${refreshing ? 'spinning' : ''}`}
                        onClick={handleRefresh}
                        disabled={refreshing}
                        title="Sync tokens from chain"
                    >
                        <RefreshCw size={16} />
                        <span>{refreshing ? 'Syncing...' : 'Sync'}</span>
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-muted py-xl">
                        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                        <p>Loading token directory...</p>
                    </div>
                ) : filteredTokens.length === 0 ? (
                    <EmptyState
                        icon={Coins}
                        title={searchQuery ? 'No Matching Tokens' : 'No Tokens Found'}
                        description={
                            searchQuery
                                ? 'Try a different search query.'
                                : 'Deploy a token or click Sync to load from chain.'
                        }
                        size="md"
                    />
                ) : (
                    <div className="token-grid animate-on-scroll">
                        {filteredTokens.map((token, i) => (
                            <div key={token.address || i} className="token-dir-card">
                                <div className="token-dir-header">
                                    <div className="token-icon-sm bg-gradient-orange">
                                        {(token.symbol || '?')[0]}
                                    </div>
                                    <div className="token-dir-info">
                                        <div className="font-bold">{token.name}</div>
                                        <div className="text-sm text-muted">{token.symbol}</div>
                                    </div>
                                </div>
                                <div className="token-dir-address">
                                    <AddressDisplay
                                        address={token.address}
                                        truncate={true}
                                        copyable={true}
                                        startChars={12}
                                        endChars={6}
                                    />
                                </div>
                                <div className="token-dir-meta">
                                    <span className="text-xs text-muted">Decimals: {token.decimals}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="directory-footer text-center text-muted text-sm mt-xl">
                    {filteredTokens.length} token{filteredTokens.length !== 1 ? 's' : ''} found
                    {searchQuery && ` matching "${searchQuery}"`}
                </div>
            </div>
        </div>
    );
};

export default TokenDirectory;
