// BitLaunch - Airdrop Tool Page (V2)
// V2: Merkle-based airdrop — build tree, approve, createAirdrop, save tree to localStorage
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import { airdropService } from '../services/AirdropService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { opnetProvider } from '../services/opnetProvider';
import { factoryService } from '../services/FactoryService';
import { blocksToHumanTime } from '../services/blockTime';
import StepWizard from '../components/StepWizard';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import BlockCountdown from '../components/BlockCountdown';
import AddressDisplay from '../components/AddressDisplay';
import {
    Send, Upload, Users, Wallet, List, Plus, Info, Gift,
    Trash2, RotateCcw, Package, XCircle, Link as LinkIcon, Copy
} from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import '../styles/airdrop.css';

const WIZARD_STEPS = ['Select Token', 'Add Recipients', 'Set Expiry', 'Review & Create'];

const parseRecipients = (text) => {
    if (!text.trim()) return [];
    return text.trim().split('\n')
        .map(line => {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length >= 2 && parts[0] && !isNaN(parseFloat(parts[1])) && parseFloat(parts[1]) > 0) {
                return { address: parts[0], amount: parts[1] };
            }
            return null;
        })
        .filter(Boolean);
};

const Airdrop = () => {
    const { connected, connect, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();

    const [activeTab, setActiveTab] = useState('create');
    const [step, setStep] = useState(0);
    const [currentBlock, setCurrentBlock] = useState(0);

    // Create form state
    const [deployedTokens, setDeployedTokens] = useState([]);
    const [loadingTokens, setLoadingTokens] = useState(false);
    const [selectedToken, setSelectedToken] = useState(null);
    const [recipients, setRecipients] = useState('');
    const [expiryBlockOffset, setExpiryBlockOffset] = useState('');
    const [creating, setCreating] = useState(false);
    const [createProgress, setCreateProgress] = useState('');
    const fileInputRef = useRef(null);

    // My Airdrops state
    const [myAirdrops, setMyAirdrops] = useState([]);
    const [loadingAirdrops, setLoadingAirdrops] = useState(false);

    const fetchCurrentBlock = useCallback(async () => {
        try {
            const p = opnetProvider.getProvider();
            if (p && p.getBlockNumber) {
                const num = await p.getBlockNumber();
                setCurrentBlock(Number(num));
            }
        } catch {}
    }, []);

    const loadTokens = useCallback(async () => {
        if (!address) return;
        setLoadingTokens(true);
        try {
            const tokens = await factoryService.getUserTokens(address);
            // Fetch token info for each
            const enriched = [];
            for (const t of tokens) {
                try {
                    const info = await airdropService.fetchTokenInfo(t.address);
                    const balance = await airdropService.getTokenBalance(t.address, address);
                    enriched.push({
                        address: t.address,
                        name: info.name,
                        symbol: info.symbol,
                        decimals: info.decimals,
                        balance,
                    });
                } catch {
                    enriched.push({ address: t.address, name: 'Unknown', symbol: '???', decimals: 8, balance: '0' });
                }
            }
            setDeployedTokens(enriched);
        } catch {
            setDeployedTokens([]);
        } finally {
            setLoadingTokens(false);
        }
    }, [address]);

    const loadMyAirdrops = useCallback(async () => {
        if (!address) return;
        setLoadingAirdrops(true);
        try {
            await fetchCurrentBlock();
            const airdrops = await airdropService.getCreatorAirdrops(address);
            setMyAirdrops(airdrops);
        } catch {
            setMyAirdrops([]);
        } finally {
            setLoadingAirdrops(false);
        }
    }, [address, fetchCurrentBlock]);

    useEffect(() => {
        if (connected) {
            fetchCurrentBlock();
            loadTokens();
        }
    }, [connected, fetchCurrentBlock, loadTokens]);

    useEffect(() => {
        if (connected && activeTab === 'list') {
            loadMyAirdrops();
        }
    }, [connected, activeTab, loadMyAirdrops]);

    const parsedRecipients = useMemo(() => parseRecipients(recipients), [recipients]);
    const totalAmount = useMemo(
        () => parsedRecipients.reduce((sum, r) => sum + parseFloat(r.amount), 0),
        [parsedRecipients]
    );

    const handleTokenSelect = (token) => {
        setSelectedToken(token);
        setStep(1);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            setRecipients(event.target.result);
            toast.success(`Loaded ${file.name}`);
        };
        reader.readAsText(file);
    };

    const validateStep = (s) => {
        if (s === 0 && !selectedToken) {
            toast.error('Please select a token');
            return false;
        }
        if (s === 1 && parsedRecipients.length === 0) {
            toast.error('Please add at least one valid recipient (address,amount)');
            return false;
        }
        if (s === 2) {
            const offset = parseInt(expiryBlockOffset);
            if (!offset || offset <= 0) {
                toast.error('Please enter a valid expiry duration in blocks');
                return false;
            }
        }
        return true;
    };

    const goNext = () => {
        if (validateStep(step) && step < WIZARD_STEPS.length - 1) {
            setStep(step + 1);
        }
    };

    const goBack = () => {
        if (step > 0) setStep(step - 1);
    };

    const handleStepClick = (idx) => {
        if (idx <= step) setStep(idx);
    };

    const handleCreateAirdrop = async () => {
        if (!validateStep(0) || !validateStep(1) || !validateStep(2)) return;

        setCreating(true);
        setCreateProgress('Starting...');
        try {
            const expiryBlock = currentBlock + parseInt(expiryBlockOffset);
            const result = await airdropService.createAirdrop({
                tokenAddress: selectedToken.address,
                recipients: parsedRecipients,
                expiryBlock,
                creator: address,
                onProgress: (msg) => setCreateProgress(msg),
            });
            // Record in transaction history
            recordTransaction({
                type: TX_TYPES.CREATE_AIRDROP,
                txHash: result?.txHash || null,
                address,
                details: {
                    airdropId: result.airdropId,
                    tokenAddress: selectedToken.address,
                    tokenSymbol: selectedToken.symbol,
                    recipientCount: result.recipientCount,
                    totalAmount,
                },
                status: 'pending',
            });

            toast.success(`Airdrop #${result.airdropId} created for ${result.recipientCount} recipients!`);

            // Reset form
            setStep(0);
            setRecipients('');
            setSelectedToken(null);
            setExpiryBlockOffset('');
            setCreateProgress('');
            setActiveTab('list');
            await loadMyAirdrops();
        } catch (error) {
            toast.error(error.message);
            setCreateProgress('');
        } finally {
            setCreating(false);
        }
    };

    const handleCancelAirdrop = async (airdropId) => {
        try {
            const result = await airdropService.cancelAirdrop(airdropId, address);
            recordTransaction({
                type: TX_TYPES.CANCEL_AIRDROP,
                txHash: result?.txHash || null,
                address,
                details: { airdropId, refundedAmount: result?.refundedAmount },
                status: 'pending',
            });
            toast.success(`Airdrop #${airdropId} cancelled. ${parseFloat(result.refundedAmount).toLocaleString()} tokens returned.`);
            await loadMyAirdrops();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRecoverExpired = async (airdropId) => {
        try {
            const result = await airdropService.recoverExpired(airdropId, address);
            recordTransaction({
                type: TX_TYPES.CANCEL_AIRDROP,
                txHash: result?.txHash || null,
                address,
                details: { airdropId, recoveredAmount: result?.recoveredAmount },
                status: 'pending',
            });
            toast.success(`Recovered ${parseFloat(result.recoveredAmount).toLocaleString()} tokens from airdrop #${airdropId}.`);
            await loadMyAirdrops();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const copyClaimLink = (airdropId) => {
        const link = `${window.location.origin}/airdrop/${airdropId}`;
        navigator.clipboard.writeText(link)
            .then(() => toast.success('Claim link copied!'))
            .catch(() => toast.error('Failed to copy'));
    };

    // Wallet gate
    if (!connected) {
        return (
            <div className="airdrop-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="airdrop-container">
                    <EmptyState
                        icon={Wallet}
                        title="Connect Your Wallet"
                        description="Connect your wallet to create and manage airdrops"
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

    const expiryBlockOffsetNum = parseInt(expiryBlockOffset) || 0;

    return (
        <div className="airdrop-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="page-hero-icon orange">
                        <Gift size={28} />
                    </div>
                    <h1 className="page-hero-title">Airdrop</h1>
                    <p className="page-hero-subtitle">Distribute tokens to your community</p>
                </div>
            </section>

            <div className="airdrop-container">
                {/* Tabs */}
                <div className="vesting-tabs animate-on-scroll">
                    <button
                        className={`vesting-tab ${activeTab === 'create' ? 'active' : ''}`}
                        onClick={() => setActiveTab('create')}
                    >
                        <Plus size={18} />
                        <span>Create Airdrop</span>
                    </button>
                    <button
                        className={`vesting-tab ${activeTab === 'list' ? 'active' : ''}`}
                        onClick={() => setActiveTab('list')}
                    >
                        <List size={18} />
                        <span>My Airdrops</span>
                    </button>
                </div>

                {activeTab === 'create' ? (
                    <div className="airdrop-card animate-on-scroll">
                        <StepWizard
                            steps={WIZARD_STEPS}
                            currentStep={step}
                            onStepClick={handleStepClick}
                        />

                        {currentBlock > 0 && (
                            <div className="block-info-banner mt-lg">
                                Current block: <strong>#{currentBlock.toLocaleString()}</strong>
                            </div>
                        )}

                        {/* Step 0: Select Token */}
                        {step === 0 && (
                            <div className="step-content animation-fadeIn mt-lg">
                                <h2 className="mb-lg">Select Token to Airdrop</h2>

                                {loadingTokens ? (
                                    <div className="text-center text-muted py-xl">
                                        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                                        <p>Loading your tokens...</p>
                                    </div>
                                ) : deployedTokens.length === 0 ? (
                                    <EmptyState
                                        icon={Package}
                                        title="No Tokens Found"
                                        description="Deploy a token from the Launch page first, or tokens will appear once synced from chain."
                                        size="sm"
                                    />
                                ) : (
                                    <div className="airdrop-token-list">
                                        {deployedTokens.map((token, i) => (
                                            <div
                                                key={token.address || i}
                                                className={`token-select-btn mb-sm ${selectedToken?.address === token.address ? 'selected' : ''}`}
                                                onClick={() => handleTokenSelect(token)}
                                            >
                                                <div className="flex items-center gap-md">
                                                    <div className="token-icon-sm bg-purple-500">
                                                        {(token.symbol || '?')[0]}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{token.name}</div>
                                                        <div className="text-xs text-muted">{token.symbol}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold">{Number(token.balance || 0).toLocaleString()}</div>
                                                    <div className="text-xs text-muted">Balance</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 1: Add Recipients */}
                        {step === 1 && (
                            <div className="step-content animation-fadeIn mt-lg">
                                <h2 className="mb-md">Add Recipients</h2>
                                <p className="text-muted mb-lg">
                                    Enter addresses and token amounts, one per line. Format: <code>address,amount</code>
                                </p>

                                <div
                                    className="csv-upload-area"
                                    onClick={() => fileInputRef.current?.click()}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <Upload size={32} className="mx-auto mb-sm" />
                                    <p className="font-medium">Upload CSV File</p>
                                    <p className="text-sm text-muted">Click to browse or drag and drop</p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv,.txt"
                                        onChange={handleFileUpload}
                                        style={{ display: 'none' }}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Or enter manually</label>
                                    <textarea
                                        className="recipients-input"
                                        placeholder={"opt1sq...,1000\nopr1sq...,500\nopt1sq...,250"}
                                        value={recipients}
                                        onChange={(e) => setRecipients(e.target.value)}
                                    ></textarea>
                                </div>

                                <div className="airdrop-summary-bar">
                                    <div className="flex items-center gap-sm">
                                        <Users size={18} />
                                        <span>{parsedRecipients.length} Recipients</span>
                                    </div>
                                    <div className="font-bold">
                                        Total: {totalAmount.toLocaleString()} {selectedToken?.symbol || ''}
                                    </div>
                                </div>

                                <div className="flex justify-between mt-lg">
                                    <button className="btn btn-ghost" onClick={goBack}>Back</button>
                                    <button className="btn btn-primary" onClick={goNext}>Next Step</button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Set Expiry */}
                        {step === 2 && (
                            <div className="step-content animation-fadeIn mt-lg">
                                <h2 className="mb-lg">Set Expiry Block</h2>
                                <p className="text-muted mb-lg">
                                    After the expiry block, unclaimed tokens can be recovered by you.
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Expiry Duration (blocks)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="e.g. 4320 (~30 days)"
                                        value={expiryBlockOffset}
                                        onChange={(e) => setExpiryBlockOffset(e.target.value)}
                                        min="1"
                                    />
                                    <div className="form-hint">
                                        144 blocks = ~1 day, 1008 = ~1 week, 4320 = ~30 days.
                                        {expiryBlockOffsetNum > 0 && (
                                            <> Expires at block #{(currentBlock + expiryBlockOffsetNum).toLocaleString()} ({blocksToHumanTime(expiryBlockOffsetNum)})</>
                                        )}
                                    </div>
                                </div>

                                <div className="info-banner mt-lg">
                                    <Info size={16} />
                                    <span>
                                        Recipients will claim tokens individually using a Merkle proof.
                                        You will need to approve the total token amount before creating.
                                    </span>
                                </div>

                                <div className="flex justify-between mt-lg">
                                    <button className="btn btn-ghost" onClick={goBack}>Back</button>
                                    <button className="btn btn-primary" onClick={goNext}>Review</button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Review & Create */}
                        {step === 3 && (
                            <div className="step-content animation-fadeIn mt-lg">
                                <h2 className="mb-lg">Review Airdrop</h2>

                                <div className="info-table">
                                    <div className="info-row">
                                        <span className="info-label">Token</span>
                                        <span className="info-value">{selectedToken?.name} ({selectedToken?.symbol})</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Token Address</span>
                                        <span className="info-value">
                                            <AddressDisplay
                                                address={selectedToken?.address || ''}
                                                truncate={true}
                                                copyable={true}
                                                startChars={10}
                                                endChars={6}
                                            />
                                        </span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Recipients</span>
                                        <span className="info-value">{parsedRecipients.length}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Total Amount</span>
                                        <span className="info-value text-orange">{totalAmount.toLocaleString()} {selectedToken?.symbol}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Expiry Block</span>
                                        <span className="info-value">#{(currentBlock + expiryBlockOffsetNum).toLocaleString()}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Expiry Time</span>
                                        <span className="info-value">{blocksToHumanTime(expiryBlockOffsetNum)}</span>
                                    </div>
                                </div>

                                <div className="info-banner mt-lg">
                                    <Info size={16} />
                                    <span>
                                        A Merkle tree will be built from the recipient list. The root is stored on-chain.
                                        Tree data is saved locally for proof generation. Share the claim link with recipients.
                                    </span>
                                </div>

                                {createProgress && (
                                    <div className="status-message warning mt-md">
                                        <div className="loading-spinner" style={{ width: 16, height: 16 }}></div>
                                        <span>{createProgress}</span>
                                    </div>
                                )}

                                <div className="flex justify-between mt-xl">
                                    <button className="btn btn-ghost" onClick={goBack} disabled={creating}>Back</button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCreateAirdrop}
                                        disabled={creating}
                                    >
                                        {creating ? (
                                            <>
                                                <div className="loading-spinner" style={{ width: 18, height: 18 }}></div>
                                                <span>Creating...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Send size={18} />
                                                <span>Create Airdrop</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* My Airdrops Tab */
                    <div className="airdrop-list">
                        {loadingAirdrops ? (
                            <div className="text-center text-muted py-xl" style={{ gridColumn: '1 / -1' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                                <p>Loading airdrops from chain...</p>
                            </div>
                        ) : myAirdrops.length === 0 ? (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <EmptyState
                                    icon={Send}
                                    title="No Airdrops"
                                    description="Create a Merkle airdrop to distribute tokens"
                                    action={
                                        <button className="btn btn-primary" onClick={() => setActiveTab('create')}>
                                            <Plus size={18} />
                                            <span>Create Airdrop</span>
                                        </button>
                                    }
                                />
                            </div>
                        ) : (
                            myAirdrops.map(airdrop => {
                                const total = parseFloat(airdrop.totalAmount || '0');
                                const claimed = parseFloat(airdrop.claimedAmount || '0');
                                const remaining = total - claimed;
                                const isExpired = currentBlock > 0 && currentBlock >= airdrop.expiryBlock;
                                const hasTreeData = airdropService.hasTreeData(airdrop.id);

                                let status = 'active';
                                if (airdrop.cancelled) status = 'cancelled';
                                else if (isExpired && remaining > 0) status = 'expired';
                                else if (remaining <= 0) status = 'completed';

                                const statusMap = {
                                    active: 'live',
                                    cancelled: 'ended',
                                    expired: 'upcoming',
                                    completed: 'finalized',
                                };

                                return (
                                    <div key={airdrop.id} className="card airdrop-card-item">
                                        <div className="card-header mb-md">
                                            <div className="flex items-center gap-md">
                                                <div className="token-icon-sm bg-gradient-purple">
                                                    <Send size={16} />
                                                </div>
                                                <div>
                                                    <h3>Airdrop #{airdrop.id}</h3>
                                                    <AddressDisplay
                                                        address={airdrop.token || ''}
                                                        truncate={true}
                                                        copyable={false}
                                                        startChars={8}
                                                        endChars={4}
                                                    />
                                                </div>
                                            </div>
                                            <StatusBadge status={statusMap[status] || 'live'} size="sm" />
                                        </div>

                                        <div className="vesting-info-row">
                                            <span className="vesting-label">Total</span>
                                            <span className="vesting-value">{total.toLocaleString()}</span>
                                        </div>
                                        <div className="vesting-info-row">
                                            <span className="vesting-label">Claimed</span>
                                            <span className="vesting-value">{claimed.toLocaleString()}</span>
                                        </div>
                                        <div className="vesting-info-row">
                                            <span className="vesting-label">Remaining</span>
                                            <span className="vesting-value">{remaining.toLocaleString()}</span>
                                        </div>

                                        {total > 0 && (
                                            <div className="mt-sm">
                                                <div className="progress-bar" style={{ height: 6 }}>
                                                    <div
                                                        className="progress-fill"
                                                        style={{ width: `${Math.min(100, (claimed / total) * 100)}%` }}
                                                    ></div>
                                                </div>
                                                <div className="flex justify-between text-xs text-muted mt-xs">
                                                    <span>{((claimed / total) * 100).toFixed(1)}% claimed</span>
                                                    <span>{remaining.toLocaleString()} left</span>
                                                </div>
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

                                        <div className="airdrop-card-actions">
                                            {/* Copy claim link */}
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => copyClaimLink(airdrop.id)}
                                                title="Copy claim link"
                                            >
                                                <LinkIcon size={14} /> Claim Link
                                            </button>

                                            {/* Cancel (only if active and not expired) */}
                                            {status === 'active' && (
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleCancelAirdrop(airdrop.id)}
                                                >
                                                    <XCircle size={14} /> Cancel
                                                </button>
                                            )}

                                            {/* Recover expired */}
                                            {status === 'expired' && (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handleRecoverExpired(airdrop.id)}
                                                >
                                                    <RotateCcw size={14} /> Recover Tokens
                                                </button>
                                            )}

                                            {/* Tree data indicator */}
                                            {hasTreeData && (
                                                <span className="text-xs text-green flex items-center gap-xs">
                                                    <Package size={12} /> Tree saved
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Airdrop;
