// BitLaunch - Presale Detail (V2 — Redesigned)
// Loads a specific presale by its contract address (from URL param).
// V2 changes: block-based timing, anti-bot, whitelist, contributor enumeration, isFinalized
/* global BigInt */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { presaleService } from '../services/PresaleService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { opnetProvider } from '../services/opnetProvider';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import AddressDisplay from '../components/AddressDisplay';
import StatusBadge from '../components/StatusBadge';
import BlockCountdown from '../components/BlockCountdown';
import ProgressBar from '../components/ProgressBar';
import { blocksToHumanTime } from '../services/blockTime';
import {
    ArrowLeft, Shield, Lock, AlertTriangle, Users, Bot,
    Zap, TrendingUp, Clock, Target, Coins, Wallet, Copy,
    ChevronDown, ChevronUp, Flame, Award
} from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import '../styles/presale.css';

const PresaleDetail = () => {
    const { id: presaleAddress } = useParams();
    const navigate = useNavigate();
    const { connected, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();

    const [presale, setPresale] = useState(null);
    const [tokenInfo, setTokenInfo] = useState(null);
    const [vestingInfo, setVestingInfo] = useState(null);
    const [antiBotConfig, setAntiBotConfig] = useState(null);
    const [myContribution, setMyContribution] = useState('0');
    const [myClaimable, setMyClaimable] = useState('0');
    const [contributorCount, setContributorCount] = useState(0);
    const [amount, setAmount] = useState('');
    const [contributing, setContributing] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [showDetails, setShowDetails] = useState(false);

    const decodedAddress = decodeURIComponent(presaleAddress);

    const fetchCurrentBlock = useCallback(async () => {
        try {
            const p = opnetProvider.getProvider();
            if (p && p.getBlockNumber) {
                const num = await p.getBlockNumber();
                setCurrentBlock(Number(num));
            }
        } catch {}
    }, []);

    const loadPresaleData = useCallback(async () => {
        setLoading(true);
        try {
            await fetchCurrentBlock();

            const info = await presaleService.getPresaleInfo(decodedAddress);
            if (!info) {
                setPresale(null);
                return;
            }

            const [rate, cancelled, paused, finalized, vesting, antiBot, contCount] = await Promise.all([
                presaleService.getRate(decodedAddress),
                presaleService.isCancelled(decodedAddress),
                presaleService.isPaused(decodedAddress),
                presaleService.isFinalized(decodedAddress),
                presaleService.getVestingInfo(decodedAddress),
                presaleService.getAntiBotConfig(decodedAddress),
                presaleService.getContributorCount(decodedAddress),
            ]);

            setPresale({
                ...info,
                presaleAddress: decodedAddress,
                rate,
                cancelled,
                paused,
                finalized,
            });
            setVestingInfo(vesting);
            setAntiBotConfig(antiBot);
            setContributorCount(contCount);

            try {
                const tInfo = await presaleService.fetchTokenInfo(info.token);
                setTokenInfo(tInfo);
            } catch {
                setTokenInfo(null);
            }

            if (connected && address) {
                const [contribution, claimable] = await Promise.all([
                    presaleService.getContribution(decodedAddress, address),
                    presaleService.getClaimable(decodedAddress, address),
                ]);
                setMyContribution(contribution);
                setMyClaimable(claimable);
            }
        } catch (err) {
            console.error('Failed to load presale:', err);
            setPresale(null);
        } finally {
            setLoading(false);
        }
    }, [decodedAddress, connected, address, fetchCurrentBlock]);

    useEffect(() => {
        loadPresaleData();
    }, [loadPresaleData]);

    const handleContribute = async () => {
        if (!connected) {
            toast.error('Please connect your wallet first');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setContributing(true);
        try {
            const contributeResult = await presaleService.contribute(decodedAddress, amount, address);
            recordTransaction({
                type: TX_TYPES.CONTRIBUTE,
                txHash: contributeResult?.txHash || null,
                address,
                details: { presaleAddress: decodedAddress, amount },
                status: 'pending',
            });
            toast.success(`Contributed ${amount} sats!`);
            setAmount('');
            await loadPresaleData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setContributing(false);
        }
    };

    const handleClaim = async () => {
        if (!connected) {
            toast.error('Please connect your wallet first');
            return;
        }

        setClaiming(true);
        try {
            const result = await presaleService.claimTokens(decodedAddress, address);
            toast.success(`Claimed ${result.tokenAmount} tokens!`);
            await loadPresaleData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setClaiming(false);
        }
    };

    const handleFinalize = async () => {
        setFinalizing(true);
        try {
            const finalizeResult = await presaleService.finalize(decodedAddress, address);
            recordTransaction({
                type: TX_TYPES.FINALIZE_PRESALE,
                txHash: finalizeResult?.txHash || null,
                address,
                details: { presaleAddress: decodedAddress },
                status: 'pending',
            });
            toast.success('Presale finalized!');
            await loadPresaleData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setFinalizing(false);
        }
    };

    const handleRefund = async () => {
        setFinalizing(true);
        try {
            const refundResult = await presaleService.refund(decodedAddress, address);
            recordTransaction({
                type: TX_TYPES.REFUND,
                txHash: refundResult?.txHash || null,
                address,
                details: { presaleAddress: decodedAddress },
                status: 'pending',
            });
            toast.success('Tokens refunded to creator.');
            await loadPresaleData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setFinalizing(false);
        }
    };

    const handleEmergencyWithdraw = async () => {
        setFinalizing(true);
        try {
            await presaleService.emergencyWithdraw(decodedAddress, address);
            toast.success('Emergency withdrawal completed.');
            await loadPresaleData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setFinalizing(false);
        }
    };

    /* ── Loading / Not Found ── */
    if (loading) return (
        <div className="presale-page page-transition">
            <div className="presale-container">
                <div className="pd-loading-state">
                    <div className="pd-loading-orb">
                        <div className="pd-loading-ring" />
                        <div className="pd-loading-ring pd-ring-2" />
                        <div className="pd-loading-core" />
                    </div>
                    <p>Loading presale from chain...</p>
                </div>
            </div>
        </div>
    );

    if (!presale) return (
        <div className="presale-page page-transition">
            <div className="presale-container">
                <div className="pd-loading-state">
                    <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Presale not found.</p>
                    <button onClick={() => navigate('/explore')} className="btn btn-secondary">
                        Back to Explore
                    </button>
                </div>
            </div>
        </div>
    );

    /* ── Derived State ── */
    const raised = Number(presale.totalRaised || 0);
    const hardCap = Number(presale.hardCap || 0);
    const softCap = Number(presale.softCap || 0);
    const status = presaleService.getPresaleStatus(presale, currentBlock);
    const softCapMet = BigInt(presale.totalRaised || '0') >= BigInt(presale.softCap || '0');
    const presaleEnded = currentBlock > 0 && currentBlock > presale.endBlock;
    const fillPercent = hardCap > 0 ? Math.min((raised / hardCap) * 100, 100) : 0;

    const isCreator = connected && address && presale.creator &&
        address.toLowerCase() === presale.creator.toLowerCase();
    const hasContribution = myContribution !== '0' && parseFloat(myContribution) > 0;
    const hasClaimable = myClaimable !== '0' && parseFloat(myClaimable) > 0;

    const tokenSymbol = tokenInfo?.symbol || '???';
    const tokenName = tokenInfo?.name || 'Unknown Token';
    const tokenDisplay = tokenInfo
        ? `${tokenInfo.name} (${tokenInfo.symbol})`
        : (presale.token || '').slice(0, 12) + '...';

    const badgeStatus = {
        live: 'active', active: 'active', upcoming: 'upcoming',
        ended: 'ended', cancelled: 'cancelled', finalized: 'finalized',
        paused: 'paused', filled: 'finalized',
    }[status] || 'ended';

    const minBuy = Number(presale.minBuy || 0);
    const maxBuy = Number(presale.maxBuy || 0);

    return (
        <div className="presale-page page-transition">
            {/* ── Hero Banner ── */}
            <div className="pd-hero">
                <div className="pd-hero-bg">
                    <div className="pd-hero-orb pd-orb-1" />
                    <div className="pd-hero-orb pd-orb-2" />
                    <div className="pd-hero-grid" />
                </div>
                <div className="presale-container">
                    <button onClick={() => navigate('/explore')} className="btn btn-ghost pd-back-btn">
                        <ArrowLeft size={18} />
                        <span>Back to Explore</span>
                    </button>

                    <div className="pd-hero-content">
                        <div className="pd-token-avatar">
                            <span>{tokenSymbol.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="pd-hero-info">
                            <div className="pd-hero-title-row">
                                <h1>{tokenName}</h1>
                                <StatusBadge status={badgeStatus} pulse={status === 'live' || status === 'active'} />
                            </div>
                            <div className="pd-hero-meta">
                                <span className="pd-token-symbol">${tokenSymbol}</span>
                                <span className="pd-meta-divider" />
                                <span className="pd-meta-item">
                                    <Users size={14} />
                                    {contributorCount} contributor{contributorCount !== 1 ? 's' : ''}
                                </span>
                                <span className="pd-meta-divider" />
                                <span className="pd-meta-item">
                                    <TrendingUp size={14} />
                                    {presale.rate} tokens/sat
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="presale-container">
                {/* Stat Ribbon */}
                <div className="pd-stat-ribbon">
                    <div className="pd-stat-card">
                        <div className="pd-stat-icon orange"><Flame size={20} /></div>
                        <div className="pd-stat-body">
                            <span className="pd-stat-value">{raised.toLocaleString()}</span>
                            <span className="pd-stat-label">Sats Raised</span>
                        </div>
                    </div>
                    <div className="pd-stat-card">
                        <div className="pd-stat-icon purple"><Target size={20} /></div>
                        <div className="pd-stat-body">
                            <span className="pd-stat-value">{hardCap.toLocaleString()}</span>
                            <span className="pd-stat-label">Hard Cap</span>
                        </div>
                    </div>
                    <div className="pd-stat-card">
                        <div className="pd-stat-icon green"><Award size={20} /></div>
                        <div className="pd-stat-body">
                            <span className="pd-stat-value">{fillPercent.toFixed(1)}%</span>
                            <span className="pd-stat-label">Filled</span>
                        </div>
                    </div>
                    <div className="pd-stat-card">
                        <div className="pd-stat-icon blue"><Clock size={20} /></div>
                        <div className="pd-stat-body">
                            <span className="pd-stat-value font-mono">#{(presale.endBlock || 0).toLocaleString()}</span>
                            <span className="pd-stat-label">End Block</span>
                        </div>
                    </div>
                </div>

                <div className="pd-grid">
                    {/* ── Left Column ── */}
                    <div className="pd-left">
                        {/* Progress Card */}
                        <div className="pd-card pd-progress-card">
                            <div className="pd-card-header">
                                <h2><Zap size={20} /> Raise Progress</h2>
                            </div>

                            <div className="pd-big-progress">
                                <div className="pd-big-progress-track">
                                    <div
                                        className="pd-big-progress-fill"
                                        style={{ width: `${fillPercent}%` }}
                                    />
                                    {softCap > 0 && softCap < hardCap && (
                                        <div
                                            className="pd-soft-cap-marker"
                                            style={{ left: `${(softCap / hardCap) * 100}%` }}
                                        >
                                            <span className="pd-soft-cap-label">Soft Cap</span>
                                        </div>
                                    )}
                                </div>
                                <div className="pd-progress-numbers">
                                    <span className="pd-raised-amount">{raised.toLocaleString()} sats</span>
                                    <span className="pd-cap-amount">{hardCap.toLocaleString()} sats</span>
                                </div>
                            </div>

                            {softCap > 0 && (
                                <div className={`pd-soft-cap-badge ${softCapMet ? 'met' : ''}`}>
                                    {softCapMet ? <Shield size={14} /> : <Target size={14} />}
                                    Soft Cap: {softCap.toLocaleString()} sats
                                    {softCapMet && <span className="pd-met-tag">MET</span>}
                                </div>
                            )}

                            {/* Countdown */}
                            {currentBlock > 0 && (status === 'upcoming' || status === 'live' || status === 'active') && (
                                <div className="pd-countdown-area">
                                    <BlockCountdown
                                        targetBlock={status === 'upcoming' ? presale.startBlock : presale.endBlock}
                                        currentBlock={currentBlock}
                                        label={status === 'upcoming' ? 'Starts in' : 'Ends in'}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Your Position Card */}
                        {connected && hasContribution && (
                            <div className="pd-card pd-position-card">
                                <div className="pd-card-header">
                                    <h2><Wallet size={20} /> Your Position</h2>
                                </div>
                                <div className="pd-position-grid">
                                    <div className="pd-position-item">
                                        <span className="pd-position-label">Contributed</span>
                                        <span className="pd-position-value orange">{Number(myContribution).toLocaleString()} sats</span>
                                    </div>
                                    <div className="pd-position-item">
                                        <span className="pd-position-label">Claimable Now</span>
                                        <span className="pd-position-value green">{Number(myClaimable).toLocaleString()} tokens</span>
                                    </div>
                                </div>

                                {presaleEnded && softCapMet && !presale.cancelled && (
                                    <button
                                        className="btn btn-primary w-full pd-claim-btn"
                                        onClick={handleClaim}
                                        disabled={claiming || !hasClaimable}
                                    >
                                        <Coins size={18} />
                                        {claiming ? 'Claiming...' :
                                         hasClaimable ? `Claim ${Number(myClaimable).toLocaleString()} Tokens` :
                                         'Nothing to Claim'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Contract Details (collapsible) */}
                        <div className="pd-card pd-details-card">
                            <button
                                className="pd-details-toggle"
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                <h2>Contract Details</h2>
                                {showDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>

                            {showDetails && (
                                <div className="pd-details-body">
                                    <div className="pd-detail-row">
                                        <span>Token Address</span>
                                        <AddressDisplay address={presale.token || ''} truncate={true} copyable={true} startChars={10} endChars={6} />
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>Presale Contract</span>
                                        <AddressDisplay address={decodedAddress} truncate={true} copyable={true} startChars={10} endChars={6} />
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>Creator</span>
                                        <AddressDisplay address={presale.creator || ''} truncate={true} copyable={true} startChars={10} endChars={6} />
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>Token Rate</span>
                                        <span className="pd-detail-val">{presale.rate} tokens/sat</span>
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>Min Buy</span>
                                        <span className="pd-detail-val">{minBuy.toLocaleString()} sats</span>
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>Max Buy</span>
                                        <span className="pd-detail-val">{maxBuy.toLocaleString()} sats</span>
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>Start Block</span>
                                        <span className="pd-detail-val font-mono">#{(presale.startBlock || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="pd-detail-row">
                                        <span>End Block</span>
                                        <span className="pd-detail-val font-mono">#{(presale.endBlock || 0).toLocaleString()}</span>
                                    </div>

                                    {/* Anti-bot */}
                                    {antiBotConfig && Number(antiBotConfig.maxPerBlock) > 0 && (
                                        <>
                                            <div className="pd-detail-section-label">
                                                <Bot size={14} /> Anti-Bot Protection
                                            </div>
                                            <div className="pd-detail-row">
                                                <span>Max Contributions / Block</span>
                                                <span className="pd-detail-val">{antiBotConfig.maxPerBlock}</span>
                                            </div>
                                        </>
                                    )}

                                    {/* Vesting */}
                                    {vestingInfo && vestingInfo.enabled && (
                                        <>
                                            <div className="pd-detail-section-label">
                                                <Lock size={14} /> Vesting Schedule
                                            </div>
                                            <div className="pd-detail-row">
                                                <span>TGE Release</span>
                                                <span className="pd-detail-val">{(Number(vestingInfo.tgeBps) / 100).toFixed(1)}%</span>
                                            </div>
                                            <div className="pd-detail-row">
                                                <span>Cliff Duration</span>
                                                <span className="pd-detail-val">{blocksToHumanTime(Number(vestingInfo.cliffBlocks || vestingInfo.cliff || 0))}</span>
                                            </div>
                                            <div className="pd-detail-row">
                                                <span>Vesting Duration</span>
                                                <span className="pd-detail-val">{blocksToHumanTime(Number(vestingInfo.durationBlocks || vestingInfo.duration || 0))}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Right Column (Sticky Action Panel) ── */}
                    <div className="pd-right">
                        <div className="pd-card pd-action-card">
                            {/* Contribute Section */}
                            {(status === 'live' || status === 'active') && !presale.paused && !presale.cancelled && (
                                <div className="pd-contribute-section">
                                    <h3>
                                        <Zap size={18} />
                                        Contribute
                                    </h3>
                                    <div className="pd-input-group">
                                        <input
                                            type="number"
                                            className="form-input pd-amount-input"
                                            placeholder="Enter amount..."
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                        />
                                        <span className="pd-input-unit">sats</span>
                                    </div>
                                    {minBuy > 0 && maxBuy > 0 && (
                                        <div className="pd-buy-limits">
                                            <span>Min: {minBuy.toLocaleString()}</span>
                                            <span>Max: {maxBuy.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-primary w-full pd-contribute-btn"
                                        onClick={handleContribute}
                                        disabled={contributing || !connected}
                                    >
                                        {contributing ? (
                                            <><span className="pd-btn-spinner" /> Contributing...</>
                                        ) : connected ? (
                                            <><Zap size={18} /> Contribute</>
                                        ) : (
                                            <><Wallet size={18} /> Connect Wallet</>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Status Messages */}
                            {status === 'upcoming' && currentBlock > 0 && (
                                <div className="pd-status-banner upcoming">
                                    <Clock size={18} />
                                    <div>
                                        <strong>Presale Not Started</strong>
                                        <BlockCountdown
                                            targetBlock={presale.startBlock}
                                            currentBlock={currentBlock}
                                            label="Starts in"
                                            size="sm"
                                        />
                                    </div>
                                </div>
                            )}

                            {presale.paused && !presale.cancelled && (
                                <div className="pd-status-banner warning">
                                    <AlertTriangle size={18} />
                                    <span>Contributions are paused</span>
                                </div>
                            )}

                            {presale.cancelled && (
                                <div className="pd-status-banner error">
                                    <AlertTriangle size={18} />
                                    <span>This presale has been cancelled</span>
                                </div>
                            )}

                            {presale.finalized && (
                                <div className="pd-status-banner success">
                                    <Shield size={18} />
                                    <span>Presale finalized successfully</span>
                                </div>
                            )}

                            {presaleEnded && !presale.finalized && !presale.cancelled && !softCapMet && (
                                <div className="pd-status-banner warning">
                                    <AlertTriangle size={18} />
                                    <span>Presale ended — soft cap not reached</span>
                                </div>
                            )}

                            {/* Creator Controls */}
                            {isCreator && (
                                <div className="pd-creator-section">
                                    <div className="pd-creator-label">
                                        <Shield size={14} /> Creator Controls
                                    </div>

                                    {presaleEnded && softCapMet && !presale.cancelled && !presale.finalized && (
                                        <button
                                            className="btn btn-primary w-full"
                                            onClick={handleFinalize}
                                            disabled={finalizing}
                                        >
                                            {finalizing ? 'Finalizing...' : 'Finalize Presale'}
                                        </button>
                                    )}

                                    {presaleEnded && !softCapMet && !presale.cancelled && !presale.finalized && (
                                        <button
                                            className="btn btn-secondary w-full"
                                            onClick={handleRefund}
                                            disabled={finalizing}
                                        >
                                            {finalizing ? 'Refunding...' : 'Refund (Soft Cap Not Met)'}
                                        </button>
                                    )}

                                    {!presaleEnded && !presale.cancelled && !presale.finalized && (
                                        <button
                                            className="btn btn-danger w-full mt-md"
                                            onClick={handleEmergencyWithdraw}
                                            disabled={finalizing}
                                        >
                                            {finalizing ? 'Withdrawing...' : 'Emergency Withdraw'}
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="pd-gas-note">
                                <Coins size={14} />
                                Ensure you have enough BTC for gas fees
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PresaleDetail;
