// BitLaunch - Vesting Page (V2)
// V2 changes: block-based timing, TGE BPS, revoke, indexed lookups, shared components
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import { vestingService } from '../services/VestingService';
import { factoryService } from '../services/FactoryService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { opnetProvider } from '../services/opnetProvider';
import { blocksToHumanTime } from '../services/blockTime';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import BlockCountdown from '../components/BlockCountdown';
import ProgressBar from '../components/ProgressBar';
import AddressDisplay from '../components/AddressDisplay';
import { Lock, Plus, List, User, Coins, Wallet, RotateCcw, Info, Calendar } from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import '../styles/vesting.css';

const Vesting = () => {
    const { connected, connect, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();
    const [activeTab, setActiveTab] = useState('list');
    const [mySchedules, setMySchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [creatingMessage, setCreatingMessage] = useState('');
    const [currentBlock, setCurrentBlock] = useState(0);

    // V2: block-based form
    const [formData, setFormData] = useState({
        tokenAddress: '',
        beneficiary: '',
        totalAmount: '',
        startBlockOffset: '',
        cliffBlocks: '',
        vestingBlocks: '',
        tgeBps: '',
    });

    const fetchCurrentBlock = useCallback(async () => {
        try {
            const p = opnetProvider.getProvider();
            if (p && p.getBlockNumber) {
                const num = await p.getBlockNumber();
                setCurrentBlock(Number(num));
            }
        } catch {}
    }, []);

    const loadSchedules = useCallback(async () => {
        if (address) {
            setLoading(true);
            try {
                await fetchCurrentBlock();
                const schedules = await vestingService.getSchedulesForAddress(address);
                setMySchedules(schedules);
            } catch (err) {
                console.error('Failed to load schedules:', err);
                setMySchedules([]);
            } finally {
                setLoading(false);
            }
        }
    }, [address, fetchCurrentBlock]);

    useEffect(() => {
        factoryService.syncTokenRegistry().catch(() => {});
        loadSchedules();
    }, [loadSchedules]);

    const handleFormChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCreateSchedule = async () => {
        if (!formData.tokenAddress || !formData.beneficiary || !formData.totalAmount || !formData.vestingBlocks) {
            toast.error('Please fill in all required fields');
            return;
        }
        if (parseFloat(formData.totalAmount) <= 0) {
            toast.error('Total amount must be greater than 0');
            return;
        }
        if (parseInt(formData.vestingBlocks) <= 0) {
            toast.error('Vesting duration must be greater than 0');
            return;
        }

        setCreating(true);
        setCreatingMessage('Preparing vesting schedule...');
        try {
            const startBlockOffset = parseInt(formData.startBlockOffset) || 0;
            const startBlock = currentBlock + Math.max(0, startBlockOffset);

            const result = await vestingService.createSchedule({
                tokenAddress: formData.tokenAddress,
                beneficiary: formData.beneficiary,
                totalAmount: formData.totalAmount,
                cliffBlocks: formData.cliffBlocks || '0',
                vestingBlocks: formData.vestingBlocks,
                startBlock: startBlock.toString(),
                tgeBps: formData.tgeBps || '0',
                creator: address,
            }, (msg) => setCreatingMessage(msg));

            // Record in transaction history
            recordTransaction({
                type: TX_TYPES.CREATE_VESTING,
                txHash: result?.txHash || null,
                address,
                details: {
                    tokenAddress: formData.tokenAddress,
                    beneficiary: formData.beneficiary,
                    totalAmount: formData.totalAmount,
                    vestingBlocks: formData.vestingBlocks,
                    tgeBps: formData.tgeBps,
                },
                status: 'pending',
            });

            toast.success('Vesting schedule created!');
            setFormData({ tokenAddress: '', beneficiary: '', totalAmount: '', startBlockOffset: '', cliffBlocks: '', vestingBlocks: '', tgeBps: '' });
            await loadSchedules();
            setActiveTab('list');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setCreating(false);
        }
    };

    const handleClaim = async (scheduleId) => {
        try {
            const result = await vestingService.claimTokens(scheduleId, address);
            recordTransaction({
                type: TX_TYPES.CLAIM_VESTING,
                txHash: result?.txHash || null,
                address,
                details: { scheduleId, claimed: result?.claimed },
                status: 'pending',
            });
            toast.success(`Claimed ${parseFloat(result.claimed).toFixed(2)} tokens`);
            await loadSchedules();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRevoke = async (scheduleId) => {
        try {
            const result = await vestingService.revokeSchedule(scheduleId, address);
            recordTransaction({
                type: TX_TYPES.REVOKE_VESTING,
                txHash: result?.txHash || null,
                address,
                details: { scheduleId, returnedAmount: result?.returnedAmount },
                status: 'pending',
            });
            toast.success(`Revoked! ${parseFloat(result.returnedAmount).toFixed(2)} tokens returned`);
            await loadSchedules();
        } catch (error) {
            toast.error(error.message);
        }
    };

    // Wallet gate
    if (!connected) {
        return (
            <div className="vesting-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="vesting-container">
                    <EmptyState
                        icon={Wallet}
                        title="Connect Your Wallet"
                        description="Connect your wallet to manage vesting schedules"
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

    // Derived form values
    const startBlockOffset = parseInt(formData.startBlockOffset) || 0;
    const cliffBlocks = parseInt(formData.cliffBlocks) || 0;
    const vestingBlocksNum = parseInt(formData.vestingBlocks) || 0;
    const tgeBpsNum = parseInt(formData.tgeBps) || 0;

    return (
        <div className="vesting-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="page-hero-icon green">
                        <Calendar size={28} />
                    </div>
                    <h1 className="page-hero-title">Vesting Schedules</h1>
                    <p className="page-hero-subtitle">Create and manage token vesting</p>
                </div>
            </section>

            <div className="vesting-container">
                <div className="vesting-tabs animate-on-scroll">
                    <button
                        className={`vesting-tab ${activeTab === 'list' ? 'active' : ''}`}
                        onClick={() => setActiveTab('list')}
                    >
                        <List size={18} />
                        <span>My Schedules</span>
                    </button>
                    <button
                        className={`vesting-tab ${activeTab === 'create' ? 'active' : ''}`}
                        onClick={() => setActiveTab('create')}
                    >
                        <Plus size={18} />
                        <span>Create Schedule</span>
                    </button>
                </div>

                {activeTab === 'create' ? (
                    <div className="card create-schedule-card">
                        <div className="wizard-card-header">
                            <h2>Create New Vesting</h2>
                            <p>Set up a block-based vesting schedule with optional TGE unlock</p>
                        </div>

                        {currentBlock > 0 && (
                            <div className="block-info-banner">
                                Current block: <strong>#{currentBlock.toLocaleString()}</strong>
                            </div>
                        )}

                        <form className="schedule-grid" onSubmit={(e) => e.preventDefault()}>
                            <div className="form-group">
                                <label className="form-label">
                                    <Coins size={14} /> Token Address <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="tokenAddress"
                                    className="form-input"
                                    placeholder="0x... hex (preferred) or opt1sq... bech32"
                                    value={formData.tokenAddress}
                                    onChange={handleFormChange}
                                />
                                <p className="form-hint">💡 Paste the <strong>0x hex address</strong> shown on the Token Factory deploy page for best compatibility.</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    <User size={14} /> Beneficiary Address <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="beneficiary"
                                    className="form-input"
                                    placeholder="Wallet address that will receive vested tokens"
                                    value={formData.beneficiary}
                                    onChange={handleFormChange}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Total Amount <span className="required">*</span></label>
                                    <input
                                        type="number"
                                        name="totalAmount"
                                        className="form-input"
                                        placeholder="e.g. 1000000"
                                        value={formData.totalAmount}
                                        onChange={handleFormChange}
                                        min="1"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">TGE Unlock (bps)</label>
                                    <input
                                        type="number"
                                        name="tgeBps"
                                        className="form-input"
                                        placeholder="0 (basis points)"
                                        value={formData.tgeBps}
                                        onChange={handleFormChange}
                                        min="0"
                                        max="10000"
                                    />
                                    <div className="form-hint">
                                        Basis points unlocked at TGE. 100 = 1%, 1000 = 10%.
                                        {tgeBpsNum > 0 && <> ({(tgeBpsNum / 100).toFixed(1)}%)</>}
                                    </div>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Start Delay (blocks)</label>
                                    <input
                                        type="number"
                                        name="startBlockOffset"
                                        className="form-input"
                                        placeholder="0 (start immediately)"
                                        value={formData.startBlockOffset}
                                        onChange={handleFormChange}
                                        min="0"
                                    />
                                    <div className="form-hint">
                                        {startBlockOffset > 0 && <>{blocksToHumanTime(startBlockOffset)}</>}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Cliff (blocks)</label>
                                    <input
                                        type="number"
                                        name="cliffBlocks"
                                        className="form-input"
                                        placeholder="0 (no cliff)"
                                        value={formData.cliffBlocks}
                                        onChange={handleFormChange}
                                        min="0"
                                    />
                                    <div className="form-hint">
                                        {cliffBlocks > 0 && <>{blocksToHumanTime(cliffBlocks)}</>}
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Vesting Duration (blocks) <span className="required">*</span></label>
                                <input
                                    type="number"
                                    name="vestingBlocks"
                                    className="form-input"
                                    placeholder="e.g. 4320 (~30 days)"
                                    value={formData.vestingBlocks}
                                    onChange={handleFormChange}
                                    min="1"
                                />
                                <div className="form-hint">
                                    Total linear vesting duration. 144 blocks = ~1 day, 1008 = ~1 week.
                                    {vestingBlocksNum > 0 && <> ({blocksToHumanTime(vestingBlocksNum)})</>}
                                </div>
                            </div>

                            <div className="info-banner">
                                <Info size={16} />
                                <span>
                                    You will need to approve the token transfer first. The vesting contract will hold tokens
                                    and release them linearly to the beneficiary over the vesting duration.
                                </span>
                            </div>

                            <button
                                type="button"
                                className="btn btn-primary w-full mt-lg"
                                onClick={handleCreateSchedule}
                                disabled={creating}
                            >
                                <Lock size={18} />
                                <span>{creating ? (creatingMessage || 'Creating...') : 'Create Schedule'}</span>
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="vesting-list">
                        {loading && (
                            <div className="text-center text-muted py-xl" style={{ gridColumn: '1 / -1' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                                <p>Loading schedules from chain...</p>
                            </div>
                        )}
                        {!loading && mySchedules.map(schedule => {
                            const progress = vestingService.computeProgress(schedule, currentBlock);
                            const claimable = vestingService.computeClaimable(schedule, currentBlock);
                            const total = parseFloat(schedule.totalAmount);
                            const claimed = parseFloat(schedule.claimedAmount);
                            const isBeneficiary = schedule.beneficiary?.toString().toLowerCase() === address?.toLowerCase();
                            const isCreatorAddr = schedule.creator?.toString().toLowerCase() === address?.toLowerCase();

                            let status = 'vesting';
                            if (schedule.revoked) status = 'revoked';
                            else if (progress >= 100) status = 'claimable';
                            else if (currentBlock < schedule.startBlock) status = 'upcoming';

                            return (
                                <div key={schedule.id} className="card vesting-card">
                                    <div className="card-header mb-lg">
                                        <div className="flex items-center gap-md">
                                            <div className="token-icon-sm bg-gradient-green">
                                                {isBeneficiary ? 'R' : 'C'}
                                            </div>
                                            <div>
                                                <h3>{isBeneficiary ? 'Receiving' : 'Created'} #{schedule.id}</h3>
                                                <AddressDisplay
                                                    address={schedule.token?.toString() || ''}
                                                    truncate={true}
                                                    copyable={false}
                                                    startChars={8}
                                                    endChars={4}
                                                />
                                            </div>
                                        </div>
                                        <StatusBadge status={status} size="sm" />
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
                                        <span className="vesting-label">Duration</span>
                                        <span className="vesting-value">
                                            {vestingService.formatDuration(schedule.vestingBlocks)}
                                        </span>
                                    </div>
                                    {schedule.tgeBps > 0 && (
                                        <div className="vesting-info-row">
                                            <span className="vesting-label">TGE Unlock</span>
                                            <span className="vesting-value">{(schedule.tgeBps / 100).toFixed(1)}%</span>
                                        </div>
                                    )}

                                    <ProgressBar
                                        value={progress}
                                        max={100}
                                        label="Vested"
                                        showPercentage={true}
                                        size="sm"
                                        variant={status === 'revoked' ? 'danger' : 'default'}
                                    />

                                    {/* Block countdown for cliff */}
                                    {currentBlock > 0 && currentBlock < schedule.startBlock + schedule.cliffBlocks && !schedule.revoked && (
                                        <BlockCountdown
                                            targetBlock={schedule.startBlock + schedule.cliffBlocks}
                                            currentBlock={currentBlock}
                                            label="Cliff ends"
                                            size="sm"
                                        />
                                    )}

                                    <div className="vesting-actions">
                                        {isBeneficiary && (
                                            <button
                                                className="btn btn-primary w-full"
                                                disabled={claimable <= 0 || schedule.revoked}
                                                onClick={() => handleClaim(schedule.id)}
                                            >
                                                {claimable > 0 ? `Claim ${claimable.toFixed(2)} Tokens` : 'Nothing to Claim'}
                                            </button>
                                        )}
                                        {isCreatorAddr && schedule.revocable && !schedule.revoked && (
                                            <button
                                                className="btn btn-danger w-full mt-sm"
                                                onClick={() => handleRevoke(schedule.id)}
                                            >
                                                <RotateCcw size={14} />
                                                <span>Revoke Schedule</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {!loading && mySchedules.length === 0 && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <EmptyState
                                    icon={Lock}
                                    title="No Vesting Schedules"
                                    description="Create a vesting schedule or wait to receive one"
                                    action={
                                        <button className="btn btn-primary" onClick={() => setActiveTab('create')}>
                                            <Plus size={18} />
                                            <span>Create Schedule</span>
                                        </button>
                                    }
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Vesting;
