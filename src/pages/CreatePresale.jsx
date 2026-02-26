// BitLaunch - Create Presale (V3)
// Creates a new presale via the PresaleFactory contract.
// V3 changes: vesting + anti-bot baked into createPresale (2-TX flow)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft, ArrowRight, Rocket, Info, Shield, ShoppingBag, Settings, Eye, Wallet,
    CheckCircle2, Loader, Clock, Search, FileCheck, Send, LayoutDashboard, Plus, PartyPopper,
    AlertTriangle, RefreshCw, Lock, Bot
} from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import { presaleFactoryService } from '../services/PresaleFactoryService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { factoryService } from '../services/FactoryService';
import { opnetProvider } from '../services/opnetProvider';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import StepWizard from '../components/StepWizard';
import AddressDisplay from '../components/AddressDisplay';
import TxTracker from '../components/TxTracker';
import { blocksToHumanTime } from '../services/blockTime';
import '../styles/presale.css';

const STEPS = ['Token & Rates', 'Caps & Limits', 'Timing', 'Vesting & Protection', 'Review'];

const VESTING_PRESETS = {
    light:    { tge: '10', cliff: '0',    duration: '1008',  label: '10% TGE, no cliff, ~7 days' },
    standard: { tge: '10', cliff: '144',  duration: '4320',  label: '10% TGE, ~1 day cliff, ~30 days' },
    strict:   { tge: '5',  cliff: '1008', duration: '12960', label: '5% TGE, ~7 day cliff, ~90 days' },
    custom:   { tge: '',   cliff: '',     duration: '',      label: 'Set your own parameters' },
};

const CreatePresale = () => {
    const navigate = useNavigate();
    const { connected, connect, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [created, setCreated] = useState(false);
    const [createResult, setCreateResult] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [errors, setErrors] = useState({});
    const [errorInfo, setErrorInfo] = useState(null);

    // Sync factory-deployed token addresses to local registry on mount
    useEffect(() => {
        factoryService.syncTokenRegistry().catch(() => {});
        const fetchBlock = async () => {
            try {
                const p = opnetProvider.getProvider();
                if (p && p.getBlockNumber) {
                    const num = await p.getBlockNumber();
                    setCurrentBlock(Number(num));
                }
            } catch {}
        };
        fetchBlock();
    }, []);

    const [formData, setFormData] = useState({
        // Step 1: Token & Rates
        tokenAddress: '',
        tokenRate: '',
        tokenAmount: '',
        // Step 2: Caps & Limits
        softCap: '',
        hardCap: '',
        minBuy: '',
        maxBuy: '',
        // Step 3: Timing (V2: block-based)
        startBlockOffset: '', // blocks from now
        durationBlocks: '',   // duration in blocks
        // Step 4: Vesting & Protection (V3)
        vestingEnabled: false,
        vestingPreset: 'standard',
        vestingTgePercent: '10',
        vestingCliffBlocks: '144',
        vestingDurationBlocks: '4320',
        antiBotEnabled: false,
        antiBotMaxPerBlock: '5',
    });

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    }, [errors]);

    const handleToggle = useCallback((field) => {
        setFormData(prev => ({ ...prev, [field]: !prev[field] }));
    }, []);

    const selectPreset = useCallback((key) => {
        const preset = VESTING_PRESETS[key];
        setFormData(prev => ({
            ...prev,
            vestingPreset: key,
            ...(key !== 'custom' ? {
                vestingTgePercent: preset.tge,
                vestingCliffBlocks: preset.cliff,
                vestingDurationBlocks: preset.duration,
            } : {}),
        }));
    }, []);

    const validateStep = (step) => {
        const newErrors = {};

        if (step === 0) {
            if (!formData.tokenAddress.trim()) newErrors.tokenAddress = 'Token address is required';
            if (!formData.tokenRate || parseFloat(formData.tokenRate) <= 0) {
                newErrors.tokenRate = 'Token rate must be greater than 0';
            } else if (!Number.isInteger(Number(formData.tokenRate))) {
                newErrors.tokenRate = 'Token rate must be a whole number';
            }
            if (!formData.tokenAmount || parseFloat(formData.tokenAmount) <= 0) {
                newErrors.tokenAmount = 'Token amount must be greater than 0';
            } else if (!Number.isInteger(Number(formData.tokenAmount))) {
                newErrors.tokenAmount = 'Token amount must be a whole number (base units)';
            }
        }

        if (step === 1) {
            if (!formData.softCap || parseFloat(formData.softCap) <= 0) {
                newErrors.softCap = 'Soft cap must be greater than 0';
            } else if (!Number.isInteger(Number(formData.softCap))) {
                newErrors.softCap = 'Soft cap must be a whole number (satoshis)';
            }
            if (!formData.hardCap || parseFloat(formData.hardCap) <= 0) {
                newErrors.hardCap = 'Hard cap must be greater than 0';
            } else if (!Number.isInteger(Number(formData.hardCap))) {
                newErrors.hardCap = 'Hard cap must be a whole number (satoshis)';
            }
            if (formData.softCap && formData.hardCap && parseFloat(formData.softCap) > parseFloat(formData.hardCap)) {
                newErrors.softCap = 'Soft cap cannot exceed hard cap';
            }
            if (formData.minBuy && formData.maxBuy && parseFloat(formData.minBuy) > parseFloat(formData.maxBuy)) {
                newErrors.minBuy = 'Min buy cannot exceed max buy';
            }
            if (formData.minBuy && !Number.isInteger(Number(formData.minBuy))) {
                newErrors.minBuy = 'Min buy must be a whole number (satoshis)';
            }
            if (formData.maxBuy && !Number.isInteger(Number(formData.maxBuy))) {
                newErrors.maxBuy = 'Max buy must be a whole number (satoshis)';
            }
            // Cross-field: tokenAmount must cover hardCap × tokenRate
            const hc = parseFloat(formData.hardCap || 0);
            const rate = parseFloat(formData.tokenRate || 0);
            const amt = parseFloat(formData.tokenAmount || 0);
            if (hc > 0 && rate > 0 && amt > 0) {
                const tokensNeeded = hc * rate;
                if (amt < tokensNeeded) {
                    newErrors.hardCap = `Requires ${tokensNeeded.toLocaleString()} tokens (hard cap × rate) but you allocated ${amt.toLocaleString()}. Reduce hard cap or go back and increase token amount.`;
                }
            }
        }

        if (step === 2) {
            if (!formData.durationBlocks || parseFloat(formData.durationBlocks) <= 0) {
                newErrors.durationBlocks = 'Duration is required';
            }
        }

        if (step === 3) {
            // Vesting & Protection — validate only when enabled
            if (formData.vestingEnabled) {
                const tge = parseFloat(formData.vestingTgePercent || 0);
                const dur = parseFloat(formData.vestingDurationBlocks || 0);
                if (dur <= 0) newErrors.vestingDurationBlocks = 'Vesting duration must be > 0';
                if (tge < 0 || tge > 100) newErrors.vestingTgePercent = 'TGE must be 0–100%';
            }
            if (formData.antiBotEnabled) {
                const max = parseFloat(formData.antiBotMaxPerBlock || 0);
                if (max <= 0) newErrors.antiBotMaxPerBlock = 'Max per block must be > 0';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const nextStep = () => {
        if (validateStep(currentStep)) {
            setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
        }
    };

    const prevStep = () => {
        setCurrentStep(prev => Math.max(prev - 1, 0));
    };

    const handleStepClick = (index) => {
        if (index < currentStep) setCurrentStep(index);
    };

    // Compute derived block values
    const startBlockOffset = parseInt(formData.startBlockOffset) || 0;
    const startBlock = currentBlock + Math.max(0, startBlockOffset);
    const durationBlocks = parseInt(formData.durationBlocks) || 0;
    const endBlock = startBlock + durationBlocks;

    // ── Progress tracker steps ──
    const PROGRESS_STEPS = [
        {
            label: 'Check Allowance',
            desc: 'Verifying your current token approval on-chain',
            icon: Search,
        },
        {
            label: 'Approve Tokens',
            desc: 'Confirm in wallet — this lets the factory transfer your tokens',
            icon: Shield,
        },
        {
            label: 'Confirm Approval',
            desc: 'Waiting for approval tx to be mined on Bitcoin (~10 min avg)',
            icon: Clock,
        },
        {
            label: 'Create Presale',
            desc: 'Simulating the presale contract deployment on-chain',
            icon: FileCheck,
        },
        {
            label: 'Sign & Broadcast',
            desc: 'Sign the creation tx in your wallet to deploy the presale',
            icon: Send,
        },
    ];

    /** Derive active progress step index from loadingMessage */
    const getProgressStep = (msg) => {
        if (!msg) return 0;
        const m = msg.toLowerCase();
        if (m.includes('confirming presale') || m.includes('sign')) return 4;
        if (m.includes('creating presale')) return 3;
        if (m.includes('waiting for approval')) return 2;
        if (m.includes('approving token')) return 1;
        return 0; // "Preparing..." or "Checking allowance..."
    };

    const activeProgressStep = getProgressStep(loadingMessage);

    /** Categorize errors into types with user-friendly guidance */
    const categorizeError = (error) => {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('denied')) {
            return { category: 'rejected', guidance: 'You cancelled the transaction in your wallet. You can safely try again.' };
        }
        if (msg.includes('not confirmed in time') || msg.includes('timeout')) {
            return { category: 'timeout', guidance: 'The transaction was sent but hasn\'t confirmed yet. Bitcoin blocks average ~10 minutes. Wait a few minutes and try again — the system will detect the existing approval.' };
        }
        if (msg.includes('insufficient tokens')) {
            return { category: 'revert', guidance: 'Your token amount is too low for the hard cap. Required: hardCap \u00d7 tokenRate tokens. Go back and increase token amount or reduce hard cap/rate.' };
        }
        if (msg.includes('revert') || msg.includes('failed:') || msg.includes('error in calling')) {
            return { category: 'revert', guidance: 'The smart contract rejected this transaction. Check your parameters (token address, caps, amounts) and try again.' };
        }
        if (msg.includes('opwallet not found') || msg.includes('not installed')) {
            return { category: 'wallet', guidance: 'OP_WALLET extension is required. Install it from opnet.org and refresh the page.' };
        }
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('rpc')) {
            return { category: 'network', guidance: 'Network connection issue. Check your internet and try again.' };
        }
        return { category: 'unknown', guidance: 'An unexpected error occurred. You can try again or go back to edit your presale parameters.' };
    };

    const handleSubmit = async () => {
        if (!connected) {
            toast.error('Please connect your wallet first');
            return;
        }

        setLoading(true);
        setLoadingMessage('Preparing presale...');
        setErrorInfo(null);

        try {
            const result = await presaleFactoryService.createPresale({
                tokenAddress: formData.tokenAddress.trim(),
                hardCap: formData.hardCap,
                softCap: formData.softCap,
                tokenRate: formData.tokenRate,
                tokenAmount: formData.tokenAmount,
                minBuy: formData.minBuy || '100000',
                maxBuy: formData.maxBuy || '10000000',
                startBlock,
                endBlock,
                // V3: Vesting + anti-bot (default '0' = disabled)
                vestingCliff: formData.vestingEnabled ? formData.vestingCliffBlocks : '0',
                vestingDuration: formData.vestingEnabled ? formData.vestingDurationBlocks : '0',
                vestingTgeBps: formData.vestingEnabled ? String(Number(formData.vestingTgePercent) * 100) : '0',
                antiBotMaxPerBlock: formData.antiBotEnabled ? formData.antiBotMaxPerBlock : '0',
                creator: address,
            }, (msg) => setLoadingMessage(msg));

            // Record in transaction history
            recordTransaction({
                type: TX_TYPES.CREATE_PRESALE,
                txHash: result.txHash || null,
                address,
                details: {
                    tokenAddress: formData.tokenAddress.trim(),
                    presaleAddress: result.presaleAddress || null,
                    hardCap: formData.hardCap,
                    softCap: formData.softCap,
                    tokenRate: formData.tokenRate,
                },
                status: result.txHash ? 'pending' : 'pending',
            });

            setCreateResult(result);
            setCreated(true);
            setLoading(false);
            toast.success('Presale created successfully!');
        } catch (error) {
            console.error(error);
            const { category, guidance } = categorizeError(error);
            setErrorInfo({
                step: activeProgressStep,
                message: error.message || 'Failed to create presale',
                category,
                guidance,
            });
            toast.error(error.message || 'Failed to create presale');
            // loading stays true — progress tracker remains visible with error
        }
    };

    // Wallet gate
    if (!connected) {
        return (
            <div className="presale-page create-presale-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="presale-container narrow">
                    <div className="wizard-card centered">
                        <div className="wallet-connect-card">
                            <div className="connect-icon">
                                <Wallet size={40} />
                            </div>
                            <h2>Connect Your Wallet</h2>
                            <p>Connect your OP_WALLET to create a presale</p>
                            <button className="btn btn-primary" onClick={connect}>
                                <Wallet size={18} />
                                <span>Connect Wallet</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Loading state — multi-step progress tracker (with error handling)
    if (loading) {
        const hasError = errorInfo !== null;

        return (
            <div className="presale-page create-presale-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="presale-container narrow">
                    <div className="wizard-card">
                        <div className="deploy-loading">
                            <h3>{hasError ? 'Presale Creation Failed' : 'Creating Presale...'}</h3>
                            <p className="deploy-loading-subtitle">
                                {hasError
                                    ? 'An error occurred during the process. See details below.'
                                    : 'This requires multiple on-chain transactions. Each step must confirm on Bitcoin before the next can proceed.'
                                }
                            </p>
                        </div>

                        <div className="presale-progress-tracker">
                            {PROGRESS_STEPS.map((step, i) => {
                                const StepIcon = step.icon;
                                const isErrorStep = hasError && i === errorInfo.step;
                                const isComplete = hasError ? i < errorInfo.step : i < activeProgressStep;
                                const isActive = hasError ? false : i === activeProgressStep;
                                const stepClass = isErrorStep ? 'error'
                                    : isComplete ? 'complete'
                                    : isActive ? 'active'
                                    : 'pending';

                                return (
                                    <div key={i} className={`progress-step ${stepClass}`}>
                                        {i > 0 && (
                                            <div className={`progress-step-line ${isComplete ? 'complete' : isErrorStep ? 'error' : isActive ? 'active' : ''}`} />
                                        )}
                                        <div className="progress-step-row">
                                            <div className="progress-step-icon">
                                                {isErrorStep ? (
                                                    <AlertTriangle size={20} />
                                                ) : isComplete ? (
                                                    <CheckCircle2 size={20} />
                                                ) : isActive ? (
                                                    <Loader size={20} className="spin" />
                                                ) : (
                                                    <StepIcon size={20} />
                                                )}
                                            </div>
                                            <div className="progress-step-content">
                                                <div className="progress-step-label">
                                                    {step.label}
                                                    {isErrorStep && <span className="progress-step-failed-badge">Failed</span>}
                                                </div>
                                                <div className="progress-step-desc">
                                                    {isErrorStep ? errorInfo.message : step.desc}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Error guidance + actions */}
                        {hasError && (
                            <div className="progress-error-details">
                                <div className="progress-error-guidance">
                                    <AlertTriangle size={16} />
                                    <span>{errorInfo.guidance}</span>
                                </div>
                                <div className="progress-error-actions">
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setErrorInfo(null);
                                            handleSubmit();
                                        }}
                                    >
                                        <RefreshCw size={18} />
                                        <span>Try Again</span>
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => {
                                            setErrorInfo(null);
                                            setLoading(false);
                                            setLoadingMessage('');
                                        }}
                                    >
                                        <ArrowLeft size={18} />
                                        <span>Edit Parameters</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Live message (only when NOT in error state) */}
                        {!hasError && loadingMessage && (
                            <div className="progress-live-message">
                                <Loader size={14} className="spin" />
                                <span>{loadingMessage}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Success state — presale created
    if (created && createResult) {
        return (
            <div className="presale-page create-presale-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="presale-container narrow">
                    {/* Celebration header */}
                    <div className="deploy-success-hero">
                        <div className="confetti-wrapper" aria-hidden="true">
                            {Array.from({ length: 16 }).map((_, i) => (
                                <span key={i} className={`confetti confetti-${i % 4}`} />
                            ))}
                        </div>
                        <div className="success-icon-ring">
                            <div className="success-icon-inner">
                                <PartyPopper size={36} />
                            </div>
                        </div>
                        <h1 className="deploy-success-title">Presale Created!</h1>
                        <p className="deploy-success-subtitle">
                            Your presale is now live on the blockchain
                        </p>
                    </div>

                    {/* Presale summary card */}
                    <div className="deploy-info-card">
                        <div className="deploy-info-grid">
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Hard Cap</span>
                                <span className="deploy-info-value">{parseFloat(formData.hardCap || 0).toLocaleString()} sats</span>
                            </div>
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Soft Cap</span>
                                <span className="deploy-info-value">{parseFloat(formData.softCap || 0).toLocaleString()} sats</span>
                            </div>
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Rate</span>
                                <span className="deploy-info-value">{formData.tokenRate} tok/sat</span>
                            </div>
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Duration</span>
                                <span className="deploy-info-value">{durationBlocks > 0 ? blocksToHumanTime(durationBlocks) : '\u2014'}</span>
                            </div>
                            {formData.vestingEnabled && (
                                <div className="deploy-info-item">
                                    <span className="deploy-info-label">Vesting</span>
                                    <span className="deploy-info-value">{formData.vestingTgePercent}% TGE + {blocksToHumanTime(parseInt(formData.vestingDurationBlocks || 0))}</span>
                                </div>
                            )}
                            {formData.antiBotEnabled && (
                                <div className="deploy-info-item">
                                    <span className="deploy-info-label">Anti-Bot</span>
                                    <span className="deploy-info-value">{formData.antiBotMaxPerBlock}/block</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Address cards */}
                    <div className="deploy-addresses">
                        {createResult.presaleAddress && (
                            <div className="deploy-address-card highlight">
                                <div className="deploy-address-header">
                                    <span className="deploy-address-label">Presale Contract Address</span>
                                    <span className="deploy-address-badge">Save this!</span>
                                </div>
                                <div className="deploy-address-value">
                                    <AddressDisplay
                                        address={createResult.presaleAddress}
                                        truncate={false}
                                        copyable={true}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="deploy-address-card">
                            <div className="deploy-address-header">
                                <span className="deploy-address-label">Token Address</span>
                            </div>
                            <div className="deploy-address-value">
                                <AddressDisplay
                                    address={formData.tokenAddress}
                                    truncate={false}
                                    copyable={true}
                                />
                            </div>
                        </div>

                        {createResult.txHash && (
                            <div className="deploy-address-card">
                                <div className="deploy-address-header">
                                    <span className="deploy-address-label">Transaction Hash</span>
                                </div>
                                <div className="deploy-address-value">
                                    <AddressDisplay
                                        address={createResult.txHash}
                                        truncate={false}
                                        copyable={true}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Real-time Transaction Tracker */}
                    {createResult.txHash && (
                        <TxTracker
                            txHash={createResult.txHash}
                            onConfirmed={() => toast.success('Presale transaction confirmed on-chain!')}
                        />
                    )}

                    {/* Action buttons */}
                    <div className="deploy-success-actions">
                        {createResult.presaleAddress && (
                            <Link
                                to={`/presale/${encodeURIComponent(createResult.presaleAddress)}`}
                                className="btn btn-primary btn-lg"
                            >
                                <Eye size={18} />
                                <span>View Presale</span>
                            </Link>
                        )}
                        <Link to="/dashboard" className="btn btn-secondary">
                            <LayoutDashboard size={18} />
                            <span>View Dashboard</span>
                        </Link>
                        <button
                            className="btn btn-ghost"
                            onClick={() => {
                                setCreated(false);
                                setCreateResult(null);
                                setCurrentStep(0);
                                setFormData({
                                    tokenAddress: '', tokenRate: '', tokenAmount: '',
                                    softCap: '', hardCap: '', minBuy: '', maxBuy: '',
                                    startBlockOffset: '', durationBlocks: '',
                                    vestingEnabled: false, vestingPreset: 'standard',
                                    vestingTgePercent: '10', vestingCliffBlocks: '144',
                                    vestingDurationBlocks: '4320',
                                    antiBotEnabled: false, antiBotMaxPerBlock: '5',
                                });
                            }}
                        >
                            <Plus size={18} />
                            <span>Create Another</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="presale-page create-presale-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="page-hero-icon purple">
                        <ShoppingBag size={28} />
                    </div>
                    <h1 className="page-hero-title">Create Presale</h1>
                    <p className="page-hero-subtitle">Launch a presale for your token</p>
                </div>
            </section>

            <div className="presale-container narrow">
                <button onClick={() => navigate(-1)} className="btn btn-ghost back-btn">
                    <ArrowLeft size={18} />
                    <span>Back</span>
                </button>

                <StepWizard
                    steps={STEPS}
                    currentStep={currentStep}
                    onStepClick={handleStepClick}
                />

                <div className="presale-card create-presale-card">
                    {/* Step 1: Token & Rates */}
                    {currentStep === 0 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><ShoppingBag size={24} className="header-icon" /> Token & Rates</h2>
                                <p>Configure the token and exchange rate for your presale</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Token Address <span className="required">*</span></label>
                                <input
                                    type="text"
                                    name="tokenAddress"
                                    className={`form-input ${errors.tokenAddress ? 'error' : ''}`}
                                    placeholder="0x... hex (preferred) or opt1sq... bech32"
                                    value={formData.tokenAddress}
                                    onChange={handleChange}
                                />
                                {errors.tokenAddress && <div className="form-error">{errors.tokenAddress}</div>}
                                <p className="form-hint">💡 Paste the <strong>0x hex address</strong> from the Token Factory deploy page for best compatibility.</p>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Token Rate <span className="required">*</span></label>
                                    <input
                                        type="number"
                                        name="tokenRate"
                                        className={`form-input ${errors.tokenRate ? 'error' : ''}`}
                                        placeholder="e.g. 1000"
                                        value={formData.tokenRate}
                                        onChange={handleChange}
                                        min="1"
                                        step="1"
                                    />
                                    <div className="form-hint">Tokens per 1 satoshi contributed</div>
                                    {errors.tokenRate && <div className="form-error">{errors.tokenRate}</div>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Token Amount <span className="required">*</span></label>
                                    <input
                                        type="number"
                                        name="tokenAmount"
                                        className={`form-input ${errors.tokenAmount ? 'error' : ''}`}
                                        placeholder="e.g. 500000"
                                        value={formData.tokenAmount}
                                        onChange={handleChange}
                                        min="1"
                                        step="1"
                                    />
                                    <div className="form-hint">Total tokens deposited into the presale</div>
                                    {errors.tokenAmount && <div className="form-error">{errors.tokenAmount}</div>}
                                </div>
                            </div>

                            <div className="info-banner">
                                <Info size={16} />
                                <span>
                                    The factory will deploy a new presale contract, transfer your tokens into it,
                                    and initialize it with your settings. You must approve the token transfer first.
                                </span>
                            </div>
                        </>
                    )}

                    {/* Step 2: Caps & Limits */}
                    {currentStep === 1 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Shield size={24} className="header-icon" /> Caps & Limits</h2>
                                <p>Set fundraising caps and contribution limits</p>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Soft Cap (sats) <span className="required">*</span></label>
                                    <input
                                        type="number"
                                        name="softCap"
                                        className={`form-input ${errors.softCap ? 'error' : ''}`}
                                        placeholder="e.g. 5000000"
                                        value={formData.softCap}
                                        onChange={handleChange}
                                        min="1"
                                        step="1"
                                    />
                                    <div className="form-hint">Minimum raise for presale to succeed</div>
                                    {errors.softCap && <div className="form-error">{errors.softCap}</div>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Hard Cap (sats) <span className="required">*</span></label>
                                    <input
                                        type="number"
                                        name="hardCap"
                                        className={`form-input ${errors.hardCap ? 'error' : ''}`}
                                        placeholder="e.g. 10000000"
                                        value={formData.hardCap}
                                        onChange={handleChange}
                                        min="1"
                                        step="1"
                                    />
                                    <div className="form-hint">
                                        Maximum total raise
                                        {parseFloat(formData.tokenRate) > 0 && parseFloat(formData.tokenAmount) > 0 && (
                                            <> · Max with your tokens: <strong>{Math.floor(parseFloat(formData.tokenAmount) / parseFloat(formData.tokenRate)).toLocaleString()} sats</strong></>
                                        )}
                                    </div>
                                    {errors.hardCap && <div className="form-error">{errors.hardCap}</div>}
                                </div>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Min Buy (sats)</label>
                                    <input
                                        type="number"
                                        name="minBuy"
                                        className={`form-input ${errors.minBuy ? 'error' : ''}`}
                                        placeholder="100000 (default)"
                                        value={formData.minBuy}
                                        onChange={handleChange}
                                        min="0"
                                        step="1"
                                    />
                                    {errors.minBuy && <div className="form-error">{errors.minBuy}</div>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Max Buy (sats)</label>
                                    <input
                                        type="number"
                                        name="maxBuy"
                                        className="form-input"
                                        placeholder="10000000 (default)"
                                        value={formData.maxBuy}
                                        onChange={handleChange}
                                        min="0"
                                        step="1"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Step 3: Timing (V2 block-based) */}
                    {currentStep === 2 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Settings size={24} className="header-icon" /> Timing</h2>
                                <p>Configure when the presale starts and ends (block-based)</p>
                            </div>

                            {currentBlock > 0 && (
                                <div className="block-info-banner">
                                    Current block: <strong>#{currentBlock.toLocaleString()}</strong>
                                </div>
                            )}

                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Start Delay (blocks)</label>
                                    <input
                                        type="number"
                                        name="startBlockOffset"
                                        className="form-input"
                                        placeholder="0 (start immediately)"
                                        value={formData.startBlockOffset}
                                        onChange={handleChange}
                                        min="0"
                                    />
                                    <div className="form-hint">
                                        Blocks from now until presale starts.
                                        {startBlockOffset > 0 && (
                                            <> ({blocksToHumanTime(startBlockOffset)})</>
                                        )}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Duration (blocks) <span className="required">*</span></label>
                                    <input
                                        type="number"
                                        name="durationBlocks"
                                        className={`form-input ${errors.durationBlocks ? 'error' : ''}`}
                                        placeholder="e.g. 1008 (~7 days)"
                                        value={formData.durationBlocks}
                                        onChange={handleChange}
                                        min="1"
                                    />
                                    <div className="form-hint">
                                        How long the presale runs.
                                        {durationBlocks > 0 && (
                                            <> ({blocksToHumanTime(durationBlocks)})</>
                                        )}
                                    </div>
                                    {errors.durationBlocks && <div className="form-error">{errors.durationBlocks}</div>}
                                </div>
                            </div>

                            <div className="timing-summary">
                                <div className="timing-row">
                                    <span>Start Block</span>
                                    <span className="font-mono">#{startBlock.toLocaleString()}</span>
                                </div>
                                <div className="timing-row">
                                    <span>End Block</span>
                                    <span className="font-mono">#{endBlock.toLocaleString()}</span>
                                </div>
                                <div className="timing-row">
                                    <span>Total Duration</span>
                                    <span>{durationBlocks > 0 ? blocksToHumanTime(durationBlocks) : '\u2014'}</span>
                                </div>
                            </div>

                            <div className="info-banner">
                                <Info size={16} />
                                <span>
                                    Bitcoin averages ~10 minutes per block. 144 blocks = ~1 day, 1008 blocks = ~1 week.
                                </span>
                            </div>
                        </>
                    )}

                    {/* Step 4: Vesting & Protection (V3) */}
                    {currentStep === 3 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Lock size={24} className="header-icon" /> Vesting & Protection</h2>
                                <p>Prevent token dumps and protect your presale from bots</p>
                            </div>

                            {/* ── Section A: Token Vesting ── */}
                            <div className="form-section">
                                <div className="vesting-toggle-row" onClick={() => handleToggle('vestingEnabled')}>
                                    <div className="vesting-toggle-info">
                                        <span className="vesting-toggle-label">Token Vesting</span>
                                        <span className="vesting-toggle-desc">Contributors receive tokens gradually over time</span>
                                    </div>
                                    <div className={`toggle-switch ${formData.vestingEnabled ? 'active' : ''}`}>
                                        <div className="toggle-knob" />
                                    </div>
                                </div>

                                {formData.vestingEnabled && (
                                    <div className="vesting-config">
                                        {/* Preset cards */}
                                        <div className="preset-grid">
                                            {Object.entries(VESTING_PRESETS).map(([key, preset]) => (
                                                <div
                                                    key={key}
                                                    className={`preset-card ${formData.vestingPreset === key ? 'active' : ''}`}
                                                    onClick={() => selectPreset(key)}
                                                >
                                                    <strong className="preset-name">{key.charAt(0).toUpperCase() + key.slice(1)}</strong>
                                                    <span className="preset-desc">{preset.label}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Manual inputs */}
                                        <div className="grid-2" style={{ marginTop: 'var(--spacing-lg)' }}>
                                            <div className="form-group">
                                                <label className="form-label">TGE Unlock %</label>
                                                <input
                                                    type="number"
                                                    name="vestingTgePercent"
                                                    className={`form-input ${errors.vestingTgePercent ? 'error' : ''}`}
                                                    placeholder="e.g. 10"
                                                    value={formData.vestingTgePercent}
                                                    onChange={(e) => {
                                                        handleChange(e);
                                                        setFormData(prev => ({ ...prev, vestingPreset: 'custom' }));
                                                    }}
                                                    min="0"
                                                    max="100"
                                                    disabled={formData.vestingPreset !== 'custom'}
                                                />
                                                <div className="form-hint">Tokens unlocked immediately at TGE</div>
                                                {errors.vestingTgePercent && <div className="form-error">{errors.vestingTgePercent}</div>}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Cliff (blocks)</label>
                                                <input
                                                    type="number"
                                                    name="vestingCliffBlocks"
                                                    className="form-input"
                                                    placeholder="e.g. 144"
                                                    value={formData.vestingCliffBlocks}
                                                    onChange={(e) => {
                                                        handleChange(e);
                                                        setFormData(prev => ({ ...prev, vestingPreset: 'custom' }));
                                                    }}
                                                    min="0"
                                                    disabled={formData.vestingPreset !== 'custom'}
                                                />
                                                <div className="form-hint">
                                                    Wait period before vesting starts
                                                    {parseInt(formData.vestingCliffBlocks) > 0 && (
                                                        <> ({blocksToHumanTime(parseInt(formData.vestingCliffBlocks))})</>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ marginTop: 'var(--spacing-md)' }}>
                                            <label className="form-label">Vesting Duration (blocks) <span className="required">*</span></label>
                                            <input
                                                type="number"
                                                name="vestingDurationBlocks"
                                                className={`form-input ${errors.vestingDurationBlocks ? 'error' : ''}`}
                                                placeholder="e.g. 4320"
                                                value={formData.vestingDurationBlocks}
                                                onChange={(e) => {
                                                    handleChange(e);
                                                    setFormData(prev => ({ ...prev, vestingPreset: 'custom' }));
                                                }}
                                                min="1"
                                                disabled={formData.vestingPreset !== 'custom'}
                                            />
                                            <div className="form-hint">
                                                Linear release period after cliff
                                                {parseInt(formData.vestingDurationBlocks) > 0 && (
                                                    <> ({blocksToHumanTime(parseInt(formData.vestingDurationBlocks))})</>
                                                )}
                                            </div>
                                            {errors.vestingDurationBlocks && <div className="form-error">{errors.vestingDurationBlocks}</div>}
                                        </div>

                                        {/* Vesting Preview */}
                                        <div className="vesting-preview">
                                            <div className="vesting-preview-title">Unlock Schedule</div>
                                            {(() => {
                                                const tge = parseFloat(formData.vestingTgePercent) || 0;
                                                const cliff = parseInt(formData.vestingCliffBlocks) || 0;
                                                const dur = parseInt(formData.vestingDurationBlocks) || 0;
                                                const total = cliff + dur;
                                                const milestones = [
                                                    { label: 'TGE', pct: Math.min(tge, 100) },
                                                    ...(cliff > 0 ? [{ label: blocksToHumanTime(cliff), pct: Math.min(tge, 100) }] : []),
                                                    ...(dur > 0 ? [
                                                        { label: blocksToHumanTime(Math.round(cliff + dur * 0.25)), pct: Math.min(tge + (100 - tge) * 0.25, 100) },
                                                        { label: blocksToHumanTime(Math.round(cliff + dur * 0.5)), pct: Math.min(tge + (100 - tge) * 0.5, 100) },
                                                        { label: blocksToHumanTime(total), pct: 100 },
                                                    ] : []),
                                                ];
                                                return milestones.map((m, i) => (
                                                    <div key={i} className="vesting-preview-row">
                                                        <span className="vesting-preview-label">{m.label}</span>
                                                        <div className="vesting-preview-bar">
                                                            <div className="vesting-preview-fill" style={{ width: `${m.pct}%` }} />
                                                        </div>
                                                        <span className="vesting-preview-pct">{Math.round(m.pct)}%</span>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Section B: Anti-Bot Protection ── */}
                            <div className="form-section" style={{ marginTop: 'var(--spacing-xl)' }}>
                                <div className="vesting-toggle-row" onClick={() => handleToggle('antiBotEnabled')}>
                                    <div className="vesting-toggle-info">
                                        <span className="vesting-toggle-label">Anti-Bot Protection</span>
                                        <span className="vesting-toggle-desc">Limit contributors per block to prevent sniping</span>
                                    </div>
                                    <div className={`toggle-switch ${formData.antiBotEnabled ? 'active' : ''}`}>
                                        <div className="toggle-knob" />
                                    </div>
                                </div>

                                {formData.antiBotEnabled && (
                                    <div className="antibot-config">
                                        <div className="form-group">
                                            <label className="form-label">Max Contributors Per Block</label>
                                            <input
                                                type="number"
                                                name="antiBotMaxPerBlock"
                                                className={`form-input ${errors.antiBotMaxPerBlock ? 'error' : ''}`}
                                                placeholder="e.g. 5"
                                                value={formData.antiBotMaxPerBlock}
                                                onChange={handleChange}
                                                min="1"
                                                step="1"
                                            />
                                            <div className="form-hint">
                                                Only this many wallets can contribute in a single block (~10 min window)
                                            </div>
                                            {errors.antiBotMaxPerBlock && <div className="form-error">{errors.antiBotMaxPerBlock}</div>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!formData.vestingEnabled && !formData.antiBotEnabled && (
                                <div className="info-banner" style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <Info size={16} />
                                    <span>
                                        Both features are optional. You can skip this step and create a basic presale
                                        without vesting or anti-bot protection.
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    {/* Step 5: Review */}
                    {currentStep === 4 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Eye size={24} className="header-icon" /> Review & Create</h2>
                                <p>Confirm your presale parameters before deployment</p>
                            </div>

                            <div className="info-table">
                                <div className="info-row">
                                    <span className="info-label">Token</span>
                                    <span className="info-value">
                                        <AddressDisplay address={formData.tokenAddress} truncate={true} copyable={true} startChars={10} endChars={6} />
                                    </span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Token Rate</span>
                                    <span className="info-value">{formData.tokenRate} tokens/sat</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Token Amount</span>
                                    <span className="info-value">{parseFloat(formData.tokenAmount || 0).toLocaleString()}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Soft Cap</span>
                                    <span className="info-value">{parseFloat(formData.softCap || 0).toLocaleString()} sats</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Hard Cap</span>
                                    <span className="info-value">{parseFloat(formData.hardCap || 0).toLocaleString()} sats</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Min / Max Buy</span>
                                    <span className="info-value">
                                        {(formData.minBuy || '100,000')} / {(formData.maxBuy || '10,000,000')} sats
                                    </span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Start Block</span>
                                    <span className="info-value font-mono">#{startBlock.toLocaleString()}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">End Block</span>
                                    <span className="info-value font-mono">#{endBlock.toLocaleString()}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Duration</span>
                                    <span className="info-value">{durationBlocks > 0 ? blocksToHumanTime(durationBlocks) : '\u2014'}</span>
                                </div>
                            </div>

                            {/* Vesting review */}
                            {formData.vestingEnabled && (
                                <div className="review-section" style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <h4 className="review-section-title">
                                        <Lock size={16} /> Token Vesting
                                    </h4>
                                    <div className="info-table">
                                        <div className="info-row">
                                            <span className="info-label">TGE Unlock</span>
                                            <span className="info-value">{formData.vestingTgePercent}%</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Cliff Period</span>
                                            <span className="info-value">
                                                {formData.vestingCliffBlocks} blocks
                                                {parseInt(formData.vestingCliffBlocks) > 0 && (
                                                    <span className="text-muted ml-sm">({blocksToHumanTime(parseInt(formData.vestingCliffBlocks))})</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Vesting Duration</span>
                                            <span className="info-value">
                                                {formData.vestingDurationBlocks} blocks
                                                {parseInt(formData.vestingDurationBlocks) > 0 && (
                                                    <span className="text-muted ml-sm">({blocksToHumanTime(parseInt(formData.vestingDurationBlocks))})</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Full Vest</span>
                                            <span className="info-value">
                                                {blocksToHumanTime(parseInt(formData.vestingCliffBlocks || 0) + parseInt(formData.vestingDurationBlocks || 0))} after presale ends
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Anti-bot review */}
                            {formData.antiBotEnabled && (
                                <div className="review-section" style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <h4 className="review-section-title">
                                        <Bot size={16} /> Anti-Bot Protection
                                    </h4>
                                    <div className="info-table">
                                        <div className="info-row">
                                            <span className="info-label">Max Per Block</span>
                                            <span className="info-value">{formData.antiBotMaxPerBlock} contributors</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="cost-breakdown" style={{ marginTop: 'var(--spacing-xl)' }}>
                                <h4 className="cost-header">Estimated Cost</h4>
                                <div className="cost-row">
                                    <span className="cost-label">Network Fee (2 txs)</span>
                                    <span>~10,000 sats</span>
                                </div>
                                <div className="cost-row">
                                    <span className="cost-label">Platform Fee</span>
                                    <span>2% of raised funds (on finalize)</span>
                                </div>
                            </div>

                            {/* Final cross-check: token sufficiency */}
                            {(() => {
                                const hc = parseFloat(formData.hardCap || 0);
                                const rate = parseFloat(formData.tokenRate || 0);
                                const amt = parseFloat(formData.tokenAmount || 0);
                                if (hc > 0 && rate > 0 && amt > 0 && amt < hc * rate) {
                                    return (
                                        <div className="info-banner warning" style={{ marginTop: 'var(--spacing-lg)' }}>
                                            <Shield size={16} />
                                            <span>
                                                <strong>Token shortage:</strong> Hard cap requires {(hc * rate).toLocaleString()} tokens
                                                but you allocated {amt.toLocaleString()}. This will fail on-chain.
                                                Go back and increase token amount or reduce hard cap.
                                            </span>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </>
                    )}

                    {/* Actions */}
                    <div className="wizard-actions">
                        {currentStep > 0 ? (
                            <button className="btn btn-ghost" onClick={prevStep}>
                                <ArrowLeft size={18} />
                                <span>Back</span>
                            </button>
                        ) : (
                            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
                                <ArrowLeft size={18} />
                                <span>Cancel</span>
                            </button>
                        )}

                        {currentStep < STEPS.length - 1 ? (
                            <button className="btn btn-primary" onClick={nextStep}>
                                <span>Continue</span>
                                <ArrowRight size={18} />
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={!connected}
                            >
                                <Rocket size={18} />
                                <span>Create Presale</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreatePresale;
