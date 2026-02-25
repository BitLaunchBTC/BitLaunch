// BitLaunch - Create Presale (V2)
// Creates a new presale via the PresaleFactory contract.
// V2 changes: block-based start/end, step wizard, anti-bot config
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Rocket, Info, Shield, ShoppingBag, Settings, Eye, Wallet } from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import { presaleFactoryService } from '../services/PresaleFactoryService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { factoryService } from '../services/FactoryService';
import { opnetProvider } from '../services/opnetProvider';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import StepWizard from '../components/StepWizard';
import AddressDisplay from '../components/AddressDisplay';
import { blocksToHumanTime } from '../services/blockTime';
import '../styles/presale.css';

const STEPS = ['Token & Rates', 'Caps & Limits', 'Timing', 'Review'];

const CreatePresale = () => {
    const navigate = useNavigate();
    const { connected, connect, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [currentStep, setCurrentStep] = useState(0);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [errors, setErrors] = useState({});

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
    });

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    }, [errors]);

    const validateStep = (step) => {
        const newErrors = {};

        if (step === 0) {
            if (!formData.tokenAddress.trim()) newErrors.tokenAddress = 'Token address is required';
            if (!formData.tokenRate || parseFloat(formData.tokenRate) <= 0) {
                newErrors.tokenRate = 'Token rate must be greater than 0';
            }
            if (!formData.tokenAmount || parseFloat(formData.tokenAmount) <= 0) {
                newErrors.tokenAmount = 'Token amount must be greater than 0';
            }
        }

        if (step === 1) {
            if (!formData.softCap || parseFloat(formData.softCap) <= 0) {
                newErrors.softCap = 'Soft cap must be greater than 0';
            }
            if (!formData.hardCap || parseFloat(formData.hardCap) <= 0) {
                newErrors.hardCap = 'Hard cap must be greater than 0';
            }
            if (formData.softCap && formData.hardCap && parseFloat(formData.softCap) > parseFloat(formData.hardCap)) {
                newErrors.softCap = 'Soft cap cannot exceed hard cap';
            }
            if (formData.minBuy && formData.maxBuy && parseFloat(formData.minBuy) > parseFloat(formData.maxBuy)) {
                newErrors.minBuy = 'Min buy cannot exceed max buy';
            }
        }

        if (step === 2) {
            if (!formData.durationBlocks || parseFloat(formData.durationBlocks) <= 0) {
                newErrors.durationBlocks = 'Duration is required';
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

    const handleSubmit = async () => {
        if (!connected) {
            toast.error('Please connect your wallet first');
            return;
        }

        setLoading(true);
        setLoadingMessage('Preparing presale...');
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

            toast.success('Presale created successfully!');

            if (result.presaleAddress) {
                setTimeout(() => navigate(`/presale/${encodeURIComponent(result.presaleAddress)}`), 1500);
            } else {
                setTimeout(() => navigate('/dashboard'), 1500);
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message || 'Failed to create presale');
        } finally {
            setLoading(false);
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

    // Loading state
    if (loading) {
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
                            <div className="loading-spinner"></div>
                            <h3>Creating Presale...</h3>
                            <p>{loadingMessage || 'Please confirm the transactions in your wallet.'}</p>
                        </div>
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
                                    placeholder="opt1sq... or opr1sq... token contract address"
                                    value={formData.tokenAddress}
                                    onChange={handleChange}
                                />
                                {errors.tokenAddress && <div className="form-error">{errors.tokenAddress}</div>}
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
                                    />
                                    <div className="form-hint">Maximum total raise</div>
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

                    {/* Step 4: Review */}
                    {currentStep === 3 && (
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
