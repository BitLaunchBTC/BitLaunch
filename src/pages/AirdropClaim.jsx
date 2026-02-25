// BitLaunch - Airdrop Claim Page (V2)
// Public claim page for airdrop recipients
// Route: /airdrop/:id
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import { airdropService } from '../services/AirdropService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { opnetProvider } from '../services/opnetProvider';
import { blocksToHumanTime } from '../services/blockTime';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import BlockCountdown from '../components/BlockCountdown';
import AddressDisplay from '../components/AddressDisplay';
import ProgressBar from '../components/ProgressBar';
import { Gift, Wallet, ArrowLeft, Check, XCircle, Clock, AlertTriangle } from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import '../styles/airdrop.css';

const AirdropClaim = () => {
    const { id: airdropId } = useParams();
    const { connected, connect, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();

    const [airdrop, setAirdrop] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [claiming, setClaiming] = useState(false);
    const [hasClaimed, setHasClaimed] = useState(false);
    const [claimedAmount, setClaimedAmount] = useState('0');
    const [eligibleAmount, setEligibleAmount] = useState(null);
    const [tokenInfo, setTokenInfo] = useState(null);

    const fetchCurrentBlock = useCallback(async () => {
        try {
            const p = opnetProvider.getProvider();
            if (p && p.getBlockNumber) {
                const num = await p.getBlockNumber();
                setCurrentBlock(Number(num));
            }
        } catch {}
    }, []);

    const loadAirdrop = useCallback(async () => {
        setLoading(true);
        try {
            await fetchCurrentBlock();
            const data = await airdropService.getAirdrop(airdropId);
            setAirdrop(data);

            if (data && data.token) {
                try {
                    const info = await airdropService.fetchTokenInfo(data.token);
                    setTokenInfo(info);
                } catch {}
            }
        } catch {
            setAirdrop(null);
        } finally {
            setLoading(false);
        }
    }, [airdropId, fetchCurrentBlock]);

    const checkEligibility = useCallback(async () => {
        if (!address || !airdropId) return;

        // Check if already claimed
        const claimed = await airdropService.hasClaimed(airdropId, address);
        setHasClaimed(claimed);

        if (claimed) {
            const amount = await airdropService.getClaimedAmount(airdropId, address);
            setClaimedAmount(amount);
        }

        // Check if proof is available
        const proof = airdropService.getProofForClaimer(airdropId, address);
        if (proof) {
            setEligibleAmount(proof.amount);
        } else {
            setEligibleAmount(null);
        }
    }, [address, airdropId]);

    useEffect(() => {
        loadAirdrop();
    }, [loadAirdrop]);

    useEffect(() => {
        if (connected && airdrop) {
            checkEligibility();
        }
    }, [connected, airdrop, checkEligibility]);

    const handleClaim = async () => {
        if (!address || !airdropId) return;
        setClaiming(true);
        try {
            const result = await airdropService.claim(airdropId, address);
            recordTransaction({
                type: TX_TYPES.CLAIM_AIRDROP,
                txHash: result?.txHash || null,
                address,
                details: {
                    airdropId,
                    claimedAmount: result.claimedAmount,
                    tokenSymbol: tokenInfo?.symbol,
                },
                status: 'pending',
            });
            toast.success(`Claimed ${parseFloat(result.claimedAmount).toLocaleString()} tokens!`);
            setHasClaimed(true);
            setClaimedAmount(result.claimedAmount);
            await loadAirdrop();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setClaiming(false);
        }
    };

    if (loading) {
        return (
            <div className="airdrop-page airdrop-claim-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="airdrop-container narrow">
                    <div className="text-center text-muted py-xl">
                        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                        <p>Loading airdrop #{airdropId}...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!airdrop) {
        return (
            <div className="airdrop-page airdrop-claim-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="airdrop-container narrow">
                    <EmptyState
                        icon={XCircle}
                        title="Airdrop Not Found"
                        description={`Airdrop #${airdropId} does not exist or could not be loaded.`}
                        action={
                            <Link to="/airdrop" className="btn btn-primary">
                                <ArrowLeft size={18} />
                                <span>Back to Airdrops</span>
                            </Link>
                        }
                        size="lg"
                    />
                </div>
            </div>
        );
    }

    const total = parseFloat(airdrop.totalAmount || '0');
    const claimed = parseFloat(airdrop.claimedAmount || '0');
    const isExpired = currentBlock > 0 && currentBlock >= airdrop.expiryBlock;
    const isActive = !airdrop.cancelled && !isExpired;

    let status = 'active';
    if (airdrop.cancelled) status = 'cancelled';
    else if (isExpired) status = 'expired';

    const statusMap = {
        active: 'live',
        cancelled: 'ended',
        expired: 'upcoming',
    };

    return (
        <div className="airdrop-page airdrop-claim-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="page-hero-icon green">
                        <Gift size={28} />
                    </div>
                    <h1 className="page-hero-title">Claim Airdrop</h1>
                    <p className="page-hero-subtitle">Check eligibility and claim tokens</p>
                </div>
            </section>

            <div className="airdrop-container narrow">
                <Link to="/airdrop" className="back-btn flex items-center gap-sm mb-lg">
                    <ArrowLeft size={16} /> Back to Airdrops
                </Link>

                <div className="claim-card animate-on-scroll">
                    <div className="claim-header">
                        <div className="claim-icon">
                            <Gift size={32} />
                        </div>
                        <h1>Airdrop #{airdropId}</h1>
                        <StatusBadge status={statusMap[status] || 'live'} />
                    </div>

                    {/* Airdrop Info */}
                    <div className="info-table mt-lg">
                        <div className="info-row">
                            <span className="info-label">Token</span>
                            <span className="info-value">
                                {tokenInfo ? `${tokenInfo.name} (${tokenInfo.symbol})` : (
                                    <AddressDisplay
                                        address={airdrop.token || ''}
                                        truncate={true}
                                        copyable={true}
                                        startChars={10}
                                        endChars={6}
                                    />
                                )}
                            </span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Creator</span>
                            <span className="info-value">
                                <AddressDisplay
                                    address={airdrop.creator || ''}
                                    truncate={true}
                                    copyable={true}
                                    startChars={10}
                                    endChars={6}
                                />
                            </span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Total Amount</span>
                            <span className="info-value">{total.toLocaleString()} {tokenInfo?.symbol || ''}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Claimed</span>
                            <span className="info-value">{claimed.toLocaleString()} {tokenInfo?.symbol || ''}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Expiry Block</span>
                            <span className="info-value">#{airdrop.expiryBlock?.toLocaleString()}</span>
                        </div>
                    </div>

                    {total > 0 && (
                        <div className="mt-lg">
                            <ProgressBar
                                value={claimed}
                                max={total}
                                label="Claimed"
                                showPercentage={true}
                                size="sm"
                            />
                        </div>
                    )}

                    {currentBlock > 0 && !isExpired && !airdrop.cancelled && (
                        <BlockCountdown
                            targetBlock={airdrop.expiryBlock}
                            currentBlock={currentBlock}
                            label="Expires"
                            size="sm"
                        />
                    )}

                    {/* Claim Section */}
                    <div className="claim-action-section">
                        {!connected ? (
                            <div className="claim-prompt">
                                <p className="text-muted mb-md">Connect your wallet to check eligibility and claim tokens.</p>
                                <button className="btn btn-primary w-full" onClick={connect}>
                                    <Wallet size={18} />
                                    <span>Connect Wallet</span>
                                </button>
                            </div>
                        ) : hasClaimed ? (
                            <div className="status-message success">
                                <Check size={18} />
                                <span>You have already claimed {parseFloat(claimedAmount).toLocaleString()} {tokenInfo?.symbol || 'tokens'}</span>
                            </div>
                        ) : !isActive ? (
                            <div className="status-message error">
                                <XCircle size={18} />
                                <span>{airdrop.cancelled ? 'This airdrop has been cancelled.' : 'This airdrop has expired.'}</span>
                            </div>
                        ) : eligibleAmount ? (
                            <div className="claim-eligible">
                                <div className="claim-eligible-amount">
                                    <span className="text-muted">Your Allocation</span>
                                    <span className="claim-amount-value">
                                        {parseFloat(eligibleAmount).toLocaleString()} {tokenInfo?.symbol || 'tokens'}
                                    </span>
                                </div>
                                <button
                                    className="btn btn-primary w-full mt-md"
                                    onClick={handleClaim}
                                    disabled={claiming}
                                >
                                    {claiming ? (
                                        <>
                                            <div className="loading-spinner" style={{ width: 18, height: 18 }}></div>
                                            <span>Claiming...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Gift size={18} />
                                            <span>Claim Tokens</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="status-message warning">
                                <AlertTriangle size={18} />
                                <span>
                                    No proof found for your address. You may not be eligible for this airdrop,
                                    or the tree data is not available locally.
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AirdropClaim;
