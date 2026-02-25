// BitLaunch - Dashboard Page (V3 - Competition UI)
// 6 tabs: My Tokens, Presales, Vesting, Locks, Airdrops, History
// V3 changes: hero banner, animated stats, pill tabs with sliding indicator, stagger cards
/* global BigInt */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { factoryService } from '../services/FactoryService';
import { tokenService } from '../services/TokenService';
import { presaleFactoryService } from '../services/PresaleFactoryService';
import { presaleService } from '../services/PresaleService';
import { vestingService } from '../services/VestingService';
import { liquidityLockService } from '../services/LiquidityLockService';
import { airdropService } from '../services/AirdropService';
import { transactionService } from '../services/TransactionService';
import { getTransactions as getTxHistory, TX_LABELS, TX_TYPES, updateTransactionStatus as updateTxHistoryStatus } from '../services/txHistory';
import { opnetProvider } from '../services/opnetProvider';
import useScrollAnimation from '../hooks/useScrollAnimation';
import TxTracker from '../components/TxTracker';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import BlockCountdown from '../components/BlockCountdown';
import AddressDisplay from '../components/AddressDisplay';
import ProgressBar from '../components/ProgressBar';
import Skeleton from '../components/Skeleton';
import {
    Wallet, Rocket, Activity, Coins, Plus, Lock,
    Unlock, Gift, ShoppingBag, Calendar,
    TrendingUp, ArrowRight, RefreshCw, Droplets,
    CheckCircle2, Send, Repeat, Flame, Ban, Clock,
    LayoutDashboard
} from 'lucide-react';
import '../styles/dashboard.css';

const TABS = [
    { id: 'tokens', label: 'My Tokens', icon: Coins },
    { id: 'presales', label: 'Presales', icon: ShoppingBag },
    { id: 'vesting', label: 'Vesting', icon: Calendar },
    { id: 'locks', label: 'Locks', icon: Lock },
    { id: 'airdrops', label: 'Airdrops', icon: Gift },
    { id: 'history', label: 'History', icon: Activity },
];

// Animated counter for stat values
const AnimatedStatValue = ({ value, loading }) => {
    const [display, setDisplay] = useState(0);
    const animRef = useRef(null);

    useEffect(() => {
        if (loading) return;
        if (value === 0) { setDisplay(0); return; }

        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / 1200, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(eased * value));
            if (progress < 1) animRef.current = requestAnimationFrame(step);
        };
        animRef.current = requestAnimationFrame(step);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [value, loading]);

    if (loading) return <Skeleton width="40px" height="32px" />;
    return <>{display}</>;
};

const Dashboard = () => {
    const { connected, address, network, provider, btcNetwork, connect } = useWallet();
    const [activeTab, setActiveTab] = useState('tokens');
    const [currentBlock, setCurrentBlock] = useState(0);
    const [loading, setLoading] = useState({});
    const [refreshing, setRefreshing] = useState(false);
    const loadedTabs = useRef(new Set());

    // Tab sliding indicator
    const tabsRef = useRef(null);
    const [indicatorStyle, setIndicatorStyle] = useState({});

    useScrollAnimation();

    // Data state per tab
    const [myTokens, setMyTokens] = useState([]);
    const [myPresales, setMyPresales] = useState([]);
    const [myVesting, setMyVesting] = useState([]);
    const [myLocks, setMyLocks] = useState([]);
    const [myAirdrops, setMyAirdrops] = useState([]);
    const [transactions, setTransactions] = useState([]);

    // Stats
    const [stats, setStats] = useState({
        tokensCreated: 0,
        activePresales: 0,
        vestingSchedules: 0,
        activeLocks: 0,
    });

    // Fetch current block number
    const fetchCurrentBlock = useCallback(async () => {
        try {
            const p = opnetProvider.getProvider();
            if (p && p.getBlockNumber) {
                const blockNum = await p.getBlockNumber();
                setCurrentBlock(Number(blockNum));
            }
        } catch (err) {
            console.warn('Failed to fetch block number:', err.message);
        }
    }, []);

    // Load tab data lazily
    const loadTabData = useCallback(async (tabId, force = false) => {
        if (!connected || !address) return;
        if (!force && loadedTabs.current.has(tabId)) return;

        setLoading(prev => ({ ...prev, [tabId]: true }));

        try {
            switch (tabId) {
                case 'tokens': {
                    tokenService.setWalletState(provider, btcNetwork);
                    const userTokens = await factoryService.getUserTokens(address);
                    const tokens = [];
                    for (const t of userTokens) {
                        try {
                            const info = await tokenService.getTokenInfo(t.address, provider, btcNetwork);
                            if (info) tokens.push({ ...info, deployBlock: t.block });
                        } catch {
                            tokens.push({ name: 'Unknown', symbol: '???', contractAddress: t.address, deployBlock: t.block });
                        }
                    }
                    setMyTokens(tokens);
                    setStats(prev => ({ ...prev, tokensCreated: tokens.length }));
                    break;
                }
                case 'presales': {
                    const creatorPresales = await presaleFactoryService.getCreatorPresales(address);
                    const presales = [];
                    for (const p of creatorPresales) {
                        try {
                            const info = await presaleService.getPresaleInfo(p.presale);
                            if (info) {
                                const status = presaleService.getPresaleStatus(info, currentBlock);
                                presales.push({ ...info, address: p.presale, tokenAddress: p.token, status });
                            }
                        } catch {
                            presales.push({ address: p.presale, tokenAddress: p.token, status: 'unknown' });
                        }
                    }
                    setMyPresales(presales);
                    setStats(prev => ({ ...prev, activePresales: presales.filter(ps => ps.status === 'active').length }));
                    break;
                }
                case 'vesting': {
                    const schedules = await vestingService.getSchedulesForAddress(address);
                    setMyVesting(schedules);
                    setStats(prev => ({ ...prev, vestingSchedules: schedules.length }));
                    break;
                }
                case 'locks': {
                    const locks = await liquidityLockService.getLocksForOwner(address);
                    setMyLocks(locks);
                    setStats(prev => ({
                        ...prev,
                        activeLocks: locks.filter(l => liquidityLockService.getLockStatus(l, currentBlock) === 'locked').length,
                    }));
                    break;
                }
                case 'airdrops': {
                    const airdrops = await airdropService.getCreatorAirdrops(address);
                    setMyAirdrops(airdrops);
                    break;
                }
                case 'history': {
                    // Merge transactions from both stores
                    const merged = [];

                    // V2 txHistory.js entries (primary)
                    const v2Txs = getTxHistory(address);
                    for (const tx of v2Txs) {
                        merged.push({
                            id: tx.id,
                            type: tx.type,
                            label: TX_LABELS[tx.type] || tx.type,
                            txHash: tx.txHash,
                            status: tx.status || 'pending',
                            timestamp: tx.timestamp,
                            tokenSymbol: tx.details?.tokenSymbol || null,
                            tokenAddress: tx.details?.tokenAddress || null,
                            tokenName: tx.details?.tokenName || null,
                            amount: tx.details?.amount || tx.details?.totalSupply || null,
                            source: 'v2',
                        });
                    }

                    // Legacy TransactionService entries
                    const legacyTxs = transactionService.getUserTransactions(address, { limit: 50 });
                    for (const tx of legacyTxs) {
                        // Deduplicate by txHash
                        if (tx.txHash && merged.some(m => m.txHash === tx.txHash)) continue;
                        const formatted = transactionService.formatTransaction(tx);
                        merged.push({
                            id: tx.id,
                            type: tx.type,
                            label: formatted.label,
                            txHash: tx.txHash,
                            status: tx.status || 'completed',
                            timestamp: tx.timestamp,
                            tokenSymbol: tx.tokenSymbol || null,
                            tokenAddress: tx.contractAddress || null,
                            tokenName: null,
                            amount: tx.amount || tx.tokenAmount || null,
                            source: 'legacy',
                        });
                    }

                    // Sort newest first, limit to 50
                    merged.sort((a, b) => b.timestamp - a.timestamp);
                    setTransactions(merged.slice(0, 50));
                    break;
                }
            }
            loadedTabs.current.add(tabId);
        } catch (err) {
            console.warn(`Failed to load ${tabId} data:`, err.message);
        } finally {
            setLoading(prev => ({ ...prev, [tabId]: false }));
        }
    }, [connected, address, provider, btcNetwork, currentBlock]);

    // Initial load: fetch block number, then load active tab
    useEffect(() => {
        if (connected && address) {
            fetchCurrentBlock();
        }
    }, [connected, address, fetchCurrentBlock]);

    // Load active tab data once block is known
    useEffect(() => {
        if (connected && address && currentBlock > 0) {
            loadTabData(activeTab);
        }
    }, [connected, address, currentBlock, activeTab, loadTabData]);

    // Also load tokens on initial connect even if block=0
    useEffect(() => {
        if (connected && address && activeTab === 'tokens') {
            loadTabData('tokens');
        }
    }, [connected, address]);

    // Update tab sliding indicator position
    useEffect(() => {
        const updateIndicator = () => {
            const container = tabsRef.current;
            if (!container) return;
            const activeBtn = container.querySelector('.tab-btn.active');
            if (!activeBtn) return;
            setIndicatorStyle({
                left: activeBtn.offsetLeft + 'px',
                width: activeBtn.offsetWidth + 'px',
            });
        };
        // Small delay to ensure DOM is updated
        const timer = setTimeout(updateIndicator, 20);
        window.addEventListener('resize', updateIndicator);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateIndicator);
        };
    }, [activeTab]);

    const handleRefresh = async () => {
        setRefreshing(true);
        loadedTabs.current.delete(activeTab);
        await fetchCurrentBlock();
        await loadTabData(activeTab, true);
        setRefreshing(false);
    };

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
    };

    const getTransactionIcon = (type) => {
        const icons = {
            // Legacy types
            deploy: <Rocket size={18} />,
            contribution: <TrendingUp size={18} />,
            claim: <Gift size={18} />,
            refund: <Droplets size={18} />,
            transfer: <Send size={18} />,
            // V2 types from txHistory.js
            [TX_TYPES.DEPLOY_TOKEN]: <Rocket size={18} />,
            [TX_TYPES.CREATE_PRESALE]: <ShoppingBag size={18} />,
            [TX_TYPES.CONTRIBUTE]: <TrendingUp size={18} />,
            [TX_TYPES.FINALIZE_PRESALE]: <CheckCircle2 size={18} />,
            [TX_TYPES.REFUND]: <Droplets size={18} />,
            [TX_TYPES.CREATE_VESTING]: <Calendar size={18} />,
            [TX_TYPES.CLAIM_VESTING]: <Gift size={18} />,
            [TX_TYPES.REVOKE_VESTING]: <Ban size={18} />,
            [TX_TYPES.LOCK_TOKENS]: <Lock size={18} />,
            [TX_TYPES.UNLOCK_TOKENS]: <Unlock size={18} />,
            [TX_TYPES.PARTIAL_UNLOCK]: <Unlock size={18} />,
            [TX_TYPES.TRANSFER_LOCK]: <Repeat size={18} />,
            [TX_TYPES.CREATE_AIRDROP]: <Gift size={18} />,
            [TX_TYPES.CLAIM_AIRDROP]: <Gift size={18} />,
            [TX_TYPES.CANCEL_AIRDROP]: <Ban size={18} />,
            [TX_TYPES.APPROVE]: <CheckCircle2 size={18} />,
            [TX_TYPES.TRANSFER]: <Send size={18} />,
        };
        return icons[type] || <Activity size={18} />;
    };

    const getIconClass = (type) => {
        // Map types to CSS classes for coloring
        const typeClassMap = {
            [TX_TYPES.DEPLOY_TOKEN]: 'deploy',
            [TX_TYPES.CREATE_PRESALE]: 'deploy',
            [TX_TYPES.CONTRIBUTE]: 'contribution',
            [TX_TYPES.FINALIZE_PRESALE]: 'claim',
            [TX_TYPES.REFUND]: 'refund',
            [TX_TYPES.CREATE_VESTING]: 'deploy',
            [TX_TYPES.CLAIM_VESTING]: 'claim',
            [TX_TYPES.REVOKE_VESTING]: 'refund',
            [TX_TYPES.LOCK_TOKENS]: 'deploy',
            [TX_TYPES.UNLOCK_TOKENS]: 'claim',
            [TX_TYPES.PARTIAL_UNLOCK]: 'claim',
            [TX_TYPES.TRANSFER_LOCK]: 'transfer',
            [TX_TYPES.CREATE_AIRDROP]: 'deploy',
            [TX_TYPES.CLAIM_AIRDROP]: 'claim',
            [TX_TYPES.CANCEL_AIRDROP]: 'refund',
            [TX_TYPES.APPROVE]: 'contribution',
            [TX_TYPES.TRANSFER]: 'transfer',
        };
        return typeClassMap[type] || type || '';
    };

    const getRelativeTime = (timestamp) => {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };

    const handleTxConfirmed = useCallback((txHash) => {
        // Update tx status in both stores and refresh the list
        updateTxHistoryStatus(txHash, 'confirmed');
        transactionService.updateTransactionStatus(txHash, 'confirmed');
        // Refresh the displayed list
        loadedTabs.current.delete('history');
        loadTabData('history', true);
    }, [loadTabData]);

    // Not connected state
    if (!connected) {
        return (
            <div className="dashboard-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="dashboard-container">
                    <EmptyState
                        icon={Wallet}
                        title="Connect Your Wallet"
                        description="Connect your wallet to view your dashboard"
                        action={
                            <button className="btn btn-primary" onClick={connect}>
                                <Wallet size={18} />
                                <span>Connect Wallet</span>
                            </button>
                        }
                        size="lg"
                    />
                </div>
            </div>
        );
    }

    const isTabLoading = loading[activeTab];

    return (
        <div className="dashboard-page page-transition">
            {/* ── Hero Banner ── */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="dashboard-hero-inner">
                        <div className="dashboard-hero-left">
                            <div className="page-hero-icon orange">
                                <LayoutDashboard size={28} />
                            </div>
                            <div>
                                <h1>Dashboard</h1>
                                <div className="dashboard-meta">
                                    <AddressDisplay address={address} truncate={true} copyable={true} startChars={8} endChars={6} />
                                    <span className="dashboard-network">{network}</span>
                                    {currentBlock > 0 && (
                                        <span className="dashboard-block">Block #{currentBlock.toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            className={`btn btn-ghost btn-icon ${refreshing ? 'spinning' : ''}`}
                            onClick={handleRefresh}
                            disabled={refreshing}
                            title="Refresh"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </div>
            </section>

            <div className="dashboard-container">
                {/* ── Stats Row ── */}
                <div className="dashboard-stats">
                    <div className="stat-card stat-card--orange animate-on-scroll" data-animate="up">
                        <div className="stat-card-icon"><Coins size={24} /></div>
                        <div className="stat-card-value">
                            <AnimatedStatValue value={stats.tokensCreated} loading={loading.tokens} />
                        </div>
                        <div className="stat-card-label">Tokens Created</div>
                    </div>
                    <div className="stat-card stat-card--purple animate-on-scroll stagger-1" data-animate="up">
                        <div className="stat-card-icon"><ShoppingBag size={24} /></div>
                        <div className="stat-card-value">
                            <AnimatedStatValue value={stats.activePresales} loading={loading.presales} />
                        </div>
                        <div className="stat-card-label">Active Presales</div>
                    </div>
                    <div className="stat-card stat-card--green animate-on-scroll stagger-2" data-animate="up">
                        <div className="stat-card-icon"><Calendar size={24} /></div>
                        <div className="stat-card-value">
                            <AnimatedStatValue value={stats.vestingSchedules} loading={loading.vesting} />
                        </div>
                        <div className="stat-card-label">Vesting Schedules</div>
                    </div>
                    <div className="stat-card stat-card--blue animate-on-scroll stagger-3" data-animate="up">
                        <div className="stat-card-icon"><Lock size={24} /></div>
                        <div className="stat-card-value">
                            <AnimatedStatValue value={stats.activeLocks} loading={loading.locks} />
                        </div>
                        <div className="stat-card-label">Active Locks</div>
                    </div>
                </div>

                {/* ── Tabs (Pill Style) ── */}
                <div className="dashboard-tabs-wrapper">
                    <div className="dashboard-tabs" ref={tabsRef}>
                        <div className="tab-indicator" style={indicatorStyle} />
                        {TABS.map(tab => {
                            const TabIcon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => handleTabChange(tab.id)}
                                >
                                    <TabIcon size={16} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Tab Content ── */}
                <div className="dashboard-section" key={activeTab}>
                    {/* My Tokens Tab */}
                    {activeTab === 'tokens' && (
                        <>
                            {isTabLoading ? (
                                <LoadingSkeleton count={3} />
                            ) : myTokens.length === 0 ? (
                                <EmptyState
                                    icon={Rocket}
                                    title="No Tokens Yet"
                                    description="Start your journey by launching your first token"
                                    action={
                                        <Link to="/launch" className="btn btn-primary">
                                            <Plus size={18} />
                                            <span>Create Token</span>
                                        </Link>
                                    }
                                />
                            ) : (
                                <div className="investments-list">
                                    {myTokens.map((token, i) => (
                                        <div key={i} className="investment-card">
                                            <div className="investment-icon">
                                                {token.symbol?.substring(0, 2) || '??'}
                                            </div>
                                            <div className="investment-info">
                                                <div className="investment-token">{token.name}</div>
                                                <span className="text-muted text-sm">
                                                    ${token.symbol}
                                                </span>
                                            </div>
                                            <div className="investment-meta">
                                                <AddressDisplay
                                                    address={token.contractAddress}
                                                    truncate={true}
                                                    copyable={true}
                                                    startChars={8}
                                                    endChars={4}
                                                />
                                                {token.deployBlock > 0 && (
                                                    <span className="text-muted text-xs">
                                                        Block #{token.deployBlock.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Presales Tab */}
                    {activeTab === 'presales' && (
                        <>
                            {isTabLoading ? (
                                <LoadingSkeleton count={2} />
                            ) : myPresales.length === 0 ? (
                                <EmptyState
                                    icon={ShoppingBag}
                                    title="No Presales"
                                    description="Create a presale to raise funds for your token"
                                    action={
                                        <Link to="/create-presale" className="btn btn-primary">
                                            <Plus size={18} />
                                            <span>Create Presale</span>
                                        </Link>
                                    }
                                />
                            ) : (
                                <div className="dash-cards-grid">
                                    {myPresales.map((presale, i) => (
                                        <PresaleCard key={i} presale={presale} currentBlock={currentBlock} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Vesting Tab */}
                    {activeTab === 'vesting' && (
                        <>
                            {isTabLoading ? (
                                <LoadingSkeleton count={2} />
                            ) : myVesting.length === 0 ? (
                                <EmptyState
                                    icon={Calendar}
                                    title="No Vesting Schedules"
                                    description="Create or receive vesting schedules to see them here"
                                    action={
                                        <Link to="/vesting" className="btn btn-primary">
                                            <Plus size={18} />
                                            <span>Create Vesting</span>
                                        </Link>
                                    }
                                />
                            ) : (
                                <div className="dash-cards-grid">
                                    {myVesting.map((schedule, i) => (
                                        <VestingScheduleCard
                                            key={schedule.id || i}
                                            schedule={schedule}
                                            currentBlock={currentBlock}
                                            address={address}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Locks Tab */}
                    {activeTab === 'locks' && (
                        <>
                            {isTabLoading ? (
                                <LoadingSkeleton count={2} />
                            ) : myLocks.length === 0 ? (
                                <EmptyState
                                    icon={Lock}
                                    title="No Locks"
                                    description="Lock LP tokens to build trust with your community"
                                    action={
                                        <Link to="/lock" className="btn btn-primary">
                                            <Plus size={18} />
                                            <span>Lock Tokens</span>
                                        </Link>
                                    }
                                />
                            ) : (
                                <div className="dash-cards-grid">
                                    {myLocks.map((lock, i) => (
                                        <LockCard key={lock.id || i} lock={lock} currentBlock={currentBlock} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Airdrops Tab */}
                    {activeTab === 'airdrops' && (
                        <>
                            {isTabLoading ? (
                                <LoadingSkeleton count={2} />
                            ) : myAirdrops.length === 0 ? (
                                <EmptyState
                                    icon={Gift}
                                    title="No Airdrops"
                                    description="Create a Merkle airdrop for your token holders"
                                    action={
                                        <Link to="/airdrop" className="btn btn-primary">
                                            <Plus size={18} />
                                            <span>Create Airdrop</span>
                                        </Link>
                                    }
                                />
                            ) : (
                                <div className="dash-cards-grid">
                                    {myAirdrops.map((airdrop, i) => (
                                        <AirdropCard key={airdrop.id || i} airdrop={airdrop} currentBlock={currentBlock} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* History Tab */}
                    {activeTab === 'history' && (
                        <>
                            {isTabLoading ? (
                                <LoadingSkeleton count={4} type="list" />
                            ) : transactions.length === 0 ? (
                                <EmptyState
                                    icon={Activity}
                                    title="No History"
                                    description="Your recent transactions will appear here. Deploy a token, create a presale, or lock tokens to get started."
                                />
                            ) : (
                                <div className="transaction-list">
                                    {transactions.map((tx, i) => (
                                        <div key={tx.id || i} className="transaction-item" data-type={getIconClass(tx.type)}>
                                            <div className={`transaction-icon ${getIconClass(tx.type)}`}>
                                                {getTransactionIcon(tx.type)}
                                            </div>
                                            <div className="transaction-info">
                                                <div className="transaction-title">{tx.label}</div>
                                                <div className="transaction-details">
                                                    {tx.tokenSymbol && <span className="tx-token-badge">${tx.tokenSymbol}</span>}
                                                    {tx.tokenName && !tx.tokenSymbol && <span className="tx-token-badge">{tx.tokenName}</span>}
                                                    {tx.txHash && (
                                                        <AddressDisplay
                                                            address={tx.txHash}
                                                            truncate={true}
                                                            copyable={true}
                                                            startChars={6}
                                                            endChars={4}
                                                        />
                                                    )}
                                                    {!tx.txHash && <span className="text-muted">No tx hash</span>}
                                                </div>
                                                {/* Show TxTracker for pending items */}
                                                {tx.status === 'pending' && tx.txHash && (
                                                    <div className="transaction-tracker-row">
                                                        <TxTracker
                                                            txHash={tx.txHash}
                                                            compact={true}
                                                            onConfirmed={() => handleTxConfirmed(tx.txHash)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="transaction-meta">
                                                <div className={`transaction-status ${tx.status}`}>
                                                    {tx.status === 'pending' ? (
                                                        <><Clock size={10} /> Pending</>
                                                    ) : tx.status === 'confirmed' ? (
                                                        <><CheckCircle2 size={10} /> Confirmed</>
                                                    ) : tx.status === 'completed' ? (
                                                        <><CheckCircle2 size={10} /> Completed</>
                                                    ) : tx.status === 'failed' ? (
                                                        <><Ban size={10} /> Failed</>
                                                    ) : tx.status}
                                                </div>
                                                <div className="transaction-time">{getRelativeTime(tx.timestamp)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Sub-components ──

const LoadingSkeleton = ({ count = 3, type = 'card' }) => {
    if (type === 'list') {
        return (
            <div className="transaction-list">
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="transaction-item">
                        <Skeleton width="42px" height="42px" borderRadius="50%" />
                        <div style={{ flex: 1 }}>
                            <Skeleton width="120px" height="18px" style={{ marginBottom: '4px' }} />
                            <Skeleton width="80px" height="14px" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="dash-cards-grid">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="dash-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <Skeleton width="120px" height="22px" />
                        <Skeleton width="70px" height="22px" borderRadius="12px" />
                    </div>
                    <Skeleton width="100%" height="12px" style={{ marginBottom: '0.5rem' }} />
                    <Skeleton width="80%" height="12px" style={{ marginBottom: '1rem' }} />
                    <Skeleton width="100%" height="8px" borderRadius="4px" />
                </div>
            ))}
        </div>
    );
};

const PresaleCard = ({ presale, currentBlock }) => {
    const statusMap = {
        active: 'active',
        upcoming: 'upcoming',
        ended: 'ended',
        cancelled: 'cancelled',
        finalized: 'finalized',
    };

    const status = statusMap[presale.status] || 'ended';
    const raised = parseFloat(presale.totalRaised || '0');
    const hardCap = parseFloat(presale.hardCap || '1');
    const progress = hardCap > 0 ? (raised / hardCap) * 100 : 0;

    return (
        <Link to={`/presale/${presale.address}`} className="dash-card dash-card--link">
            <div className="dash-card-header">
                <h4 className="dash-card-title">
                    {presale.tokenSymbol || 'Presale'}
                </h4>
                <StatusBadge status={status} size="sm" pulse={status === 'active'} />
            </div>
            <div className="dash-card-row">
                <span className="text-muted">Raised</span>
                <span>{raised.toLocaleString()} / {hardCap.toLocaleString()} sats</span>
            </div>
            <ProgressBar value={raised} max={hardCap} showPercentage={true} size="sm" />
            {presale.endBlock && currentBlock > 0 && status === 'active' && (
                <BlockCountdown
                    targetBlock={presale.endBlock}
                    currentBlock={currentBlock}
                    label="Ends"
                    size="sm"
                />
            )}
            <div className="dash-card-footer">
                <span className="text-muted text-xs">
                    <AddressDisplay address={presale.address} truncate={true} copyable={false} startChars={8} endChars={4} />
                </span>
                <ArrowRight size={14} className="text-muted" />
            </div>
        </Link>
    );
};

const VestingScheduleCard = ({ schedule, currentBlock, address }) => {
    const total = parseFloat(schedule.totalAmount || '0');
    const claimed = parseFloat(schedule.claimedAmount || '0');
    const progress = vestingService.computeProgress(schedule, currentBlock);
    const claimable = vestingService.computeClaimable(schedule, currentBlock);
    const isBeneficiary = schedule.beneficiary?.toString().toLowerCase() === address?.toLowerCase();

    let status = 'vesting';
    if (schedule.revoked) status = 'revoked';
    else if (progress >= 100) status = 'claimable';
    else if (currentBlock < schedule.startBlock) status = 'upcoming';

    return (
        <div className="dash-card">
            <div className="dash-card-header">
                <h4 className="dash-card-title">
                    {isBeneficiary ? 'Receiving' : 'Created'} #{schedule.id}
                </h4>
                <StatusBadge status={status} size="sm" />
            </div>

            <div className="dash-card-stats">
                <div className="dash-stat">
                    <span className="dash-stat-label">Total</span>
                    <span className="dash-stat-value">{total.toLocaleString()}</span>
                </div>
                <div className="dash-stat">
                    <span className="dash-stat-label">Claimed</span>
                    <span className="dash-stat-value">{claimed.toLocaleString()}</span>
                </div>
                {claimable > 0 && (
                    <div className="dash-stat dash-stat--highlight">
                        <span className="dash-stat-label">Claimable</span>
                        <span className="dash-stat-value">{claimable.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <ProgressBar
                value={progress}
                max={100}
                label="Vested"
                showPercentage={true}
                size="sm"
                variant={status === 'revoked' ? 'danger' : 'default'}
            />

            {schedule.tgeBps > 0 && (
                <div className="dash-card-row text-xs">
                    <span className="text-muted">TGE Unlock</span>
                    <span>{(schedule.tgeBps / 100).toFixed(1)}%</span>
                </div>
            )}

            {currentBlock > 0 && currentBlock < schedule.startBlock + schedule.cliffBlocks && !schedule.revoked && (
                <BlockCountdown
                    targetBlock={schedule.startBlock + schedule.cliffBlocks}
                    currentBlock={currentBlock}
                    label="Cliff ends"
                    size="sm"
                />
            )}
        </div>
    );
};

const LockCard = ({ lock, currentBlock }) => {
    const status = liquidityLockService.getLockStatus(lock, currentBlock);
    const remaining = liquidityLockService.getRemainingAmount(lock);
    const remainingNum = parseFloat(remaining);
    const totalNum = parseFloat(lock.amount || '0');
    const withdrawnNum = parseFloat(lock.withdrawn || '0');

    const statusMap = {
        locked: 'locked',
        unlockable: 'unlockable',
        withdrawn: 'ended',
    };

    return (
        <Link to="/lock" className="dash-card dash-card--link">
            <div className="dash-card-header">
                <h4 className="dash-card-title">Lock #{lock.id}</h4>
                <StatusBadge status={statusMap[status] || 'locked'} size="sm" />
            </div>

            <div className="dash-card-stats">
                <div className="dash-stat">
                    <span className="dash-stat-label">Locked</span>
                    <span className="dash-stat-value">{totalNum.toLocaleString()}</span>
                </div>
                <div className="dash-stat">
                    <span className="dash-stat-label">Remaining</span>
                    <span className="dash-stat-value">{remainingNum.toLocaleString()}</span>
                </div>
            </div>

            {totalNum > 0 && (
                <ProgressBar
                    value={withdrawnNum}
                    max={totalNum}
                    label="Withdrawn"
                    showPercentage={true}
                    size="sm"
                    variant={status === 'withdrawn' ? 'success' : 'default'}
                />
            )}

            {currentBlock > 0 && status === 'locked' && (
                <BlockCountdown
                    targetBlock={lock.unlockBlock}
                    currentBlock={currentBlock}
                    label="Unlocks"
                    size="sm"
                />
            )}

            {status === 'unlockable' && (
                <div className="dash-card-action">
                    <Unlock size={14} />
                    <span>Ready to unlock</span>
                </div>
            )}

            <div className="dash-card-footer">
                <AddressDisplay
                    address={lock.token?.toString() || ''}
                    truncate={true}
                    copyable={false}
                    startChars={8}
                    endChars={4}
                />
                <ArrowRight size={14} className="text-muted" />
            </div>
        </Link>
    );
};

const AirdropCard = ({ airdrop, currentBlock }) => {
    const total = parseFloat(airdrop.totalAmount || '0');
    const claimedAmt = parseFloat(airdrop.claimedAmount || '0');

    let status = 'active';
    if (airdrop.cancelled) status = 'cancelled';
    else if (currentBlock > 0 && currentBlock >= airdrop.expiryBlock) status = 'expired';

    return (
        <Link to={`/airdrop/${airdrop.id}`} className="dash-card dash-card--link">
            <div className="dash-card-header">
                <h4 className="dash-card-title">Airdrop #{airdrop.id}</h4>
                <StatusBadge status={status} size="sm" pulse={status === 'active'} />
            </div>

            <div className="dash-card-row">
                <span className="text-muted">Claimed</span>
                <span>{claimedAmt.toLocaleString()} / {total.toLocaleString()}</span>
            </div>

            <ProgressBar value={claimedAmt} max={total} showPercentage={true} size="sm" />

            {currentBlock > 0 && status === 'active' && airdrop.expiryBlock && (
                <BlockCountdown
                    targetBlock={airdrop.expiryBlock}
                    currentBlock={currentBlock}
                    label="Expires"
                    size="sm"
                />
            )}

            <div className="dash-card-footer">
                <AddressDisplay
                    address={airdrop.token?.toString() || ''}
                    truncate={true}
                    copyable={false}
                    startChars={8}
                    endChars={4}
                />
                <ArrowRight size={14} className="text-muted" />
            </div>
        </Link>
    );
};

export default Dashboard;
