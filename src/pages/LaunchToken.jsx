// BitLaunch - Launch Token Page (V3 - Competition UI)
// 4-step wizard: Token Info -> Settings -> Advanced (free mint + burn) -> Review
// V3 changes: page hero, orbital spinner, confetti celebration, enhanced visuals
import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import { factoryDeploymentService } from '../services/FactoryDeploymentService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import useScrollAnimation from '../hooks/useScrollAnimation';
import StepWizard from '../components/StepWizard';
import AddressDisplay from '../components/AddressDisplay';
import TxTracker from '../components/TxTracker';
import {
    Rocket, Check, ExternalLink, ArrowLeft, ArrowRight,
    Coins, Settings, Zap, Eye, Wallet, Flame, Gift, Copy,
    PartyPopper, LayoutDashboard, Plus, Share2
} from 'lucide-react';
import '../styles/launch.css';

const STEPS = ['Token Info', 'Settings', 'Advanced', 'Review'];

const LaunchToken = () => {
    const { connected, address, opAddress, network, btcNetwork, provider, connect } = useWallet();
    const [currentStep, setCurrentStep] = useState(0);
    const [deploying, setDeploying] = useState(false);
    const [deployed, setDeployed] = useState(false);
    const [deployResult, setDeployResult] = useState(null);
    const toast = useToast();
    const [errors, setErrors] = useState({});
    useScrollAnimation();

    const [formData, setFormData] = useState({
        // Step 1: Token Info
        name: '',
        symbol: '',
        totalSupply: '',
        preMintAmount: '',
        // Step 2: Settings
        decimals: 18,
        // Step 3: Advanced
        freeMintSupply: '',
        freeMintPerTx: '',
        freeMintUserCap: '',
        burnEnabled: false,
    });

    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    }, [errors]);

    const validateStep = (step) => {
        const newErrors = {};

        if (step === 0) {
            if (!formData.name.trim()) newErrors.name = 'Token name is required';
            else if (formData.name.length > 50) newErrors.name = 'Max 50 characters';
            if (!formData.symbol.trim()) newErrors.symbol = 'Symbol is required';
            else if (formData.symbol.length > 10) newErrors.symbol = 'Max 10 characters';
            if (!formData.totalSupply || parseFloat(formData.totalSupply) <= 0) {
                newErrors.totalSupply = 'Enter a valid supply';
            }
            if (formData.preMintAmount) {
                if (parseFloat(formData.preMintAmount) < 0) {
                    newErrors.preMintAmount = 'Pre-mint cannot be negative';
                } else if (parseFloat(formData.preMintAmount) > parseFloat(formData.totalSupply || 0)) {
                    newErrors.preMintAmount = 'Pre-mint cannot exceed total supply';
                }
            }
        }

        if (step === 1) {
            if (formData.decimals < 0 || formData.decimals > 18) {
                newErrors.decimals = 'Decimals must be 0-18';
            }
        }

        if (step === 2) {
            const supply = parseFloat(formData.totalSupply || 0);
            if (formData.freeMintSupply) {
                if (parseFloat(formData.freeMintSupply) < 0) {
                    newErrors.freeMintSupply = 'Cannot be negative';
                } else if (parseFloat(formData.freeMintSupply) > supply) {
                    newErrors.freeMintSupply = 'Cannot exceed total supply';
                }
            }
            if (formData.freeMintPerTx) {
                if (parseFloat(formData.freeMintPerTx) <= 0) {
                    newErrors.freeMintPerTx = 'Must be greater than 0';
                }
                if (formData.freeMintSupply && parseFloat(formData.freeMintPerTx) > parseFloat(formData.freeMintSupply)) {
                    newErrors.freeMintPerTx = 'Cannot exceed free mint supply';
                }
            }
            if (formData.freeMintUserCap) {
                if (parseFloat(formData.freeMintUserCap) <= 0) {
                    newErrors.freeMintUserCap = 'Must be greater than 0';
                }
                if (formData.freeMintSupply && parseFloat(formData.freeMintUserCap) > parseFloat(formData.freeMintSupply)) {
                    newErrors.freeMintUserCap = 'Cannot exceed free mint supply';
                }
            }
            // If freeMintPerTx is set, freeMintSupply must be set too
            if (formData.freeMintPerTx && !formData.freeMintSupply) {
                newErrors.freeMintSupply = 'Required when free mint per TX is set';
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
        // Only allow going back to completed steps
        if (index < currentStep) {
            setCurrentStep(index);
        }
    };

    const handleDeploy = async () => {
        if (!connected) {
            toast.error('Please connect your wallet first');
            return;
        }

        setDeploying(true);
        try {
            const params = {
                name: formData.name.trim(),
                symbol: formData.symbol.toUpperCase().trim(),
                totalSupply: parseFloat(formData.totalSupply),
                decimals: parseInt(formData.decimals),
                preMintAmount: formData.preMintAmount
                    ? parseFloat(formData.preMintAmount)
                    : parseFloat(formData.totalSupply),
                freeMintSupply: formData.freeMintSupply ? parseFloat(formData.freeMintSupply) : 0,
                freeMintPerTx: formData.freeMintPerTx ? parseFloat(formData.freeMintPerTx) : 0,
                freeMintUserCap: formData.freeMintUserCap ? parseFloat(formData.freeMintUserCap) : 0,
                burnEnabled: formData.burnEnabled,
            };

            const walletState = { address, opAddress, provider, btcNetwork, network };
            const result = await factoryDeploymentService.deployToken(params, walletState);

            // Record in transaction history
            recordTransaction({
                type: TX_TYPES.DEPLOY_TOKEN,
                txHash: result.txHash,
                address,
                details: {
                    tokenName: params.name,
                    tokenSymbol: params.symbol,
                    tokenAddress: result.tokenAddress,
                    totalSupply: params.totalSupply,
                },
                status: result.txHash ? 'pending' : 'pending',
            });

            setDeployResult(result);
            setDeployed(true);
            if (result.warning) {
                toast.warning(result.warning);
                toast.success('Token created! Address extracted from simulation. Verify on-chain.');
            } else {
                toast.success('Token deployed successfully!');
            }
        } catch (error) {
            console.error('Deploy failed:', error);
            const errorMessage = error.message || 'Unknown error';

            if (errorMessage.includes('OPWallet not found')) {
                toast.error('OPWallet Extension Required! Install from opnet.org');
            } else if (errorMessage.includes('rejected') || errorMessage.includes('cancelled')) {
                toast.error('Transaction rejected by user');
            } else {
                toast.error(`Deployment failed: ${errorMessage}`);
            }
        } finally {
            setDeploying(false);
        }
    };

    // Not connected state
    if (!connected) {
        return (
            <div className="launch-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="launch-container">
                    <div className="wizard-card centered">
                        <div className="wallet-connect-card">
                            <div className="connect-icon">
                                <Wallet size={40} />
                            </div>
                            <h2>Connect Your Wallet</h2>
                            <p>Connect your OP_WALLET to deploy tokens on {network}</p>
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

    // Deploying state — orbital spinner
    if (deploying) {
        return (
            <div className="launch-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="launch-container">
                    <div className="wizard-card">
                        <div className="deploy-loading">
                            <div className="orbital-spinner">
                                <div className="orbital-ring" />
                                <div className="orbital-ring orbital-ring--2" />
                                <div className="orbital-core">
                                    <Rocket size={28} />
                                </div>
                            </div>
                            <h3>Deploying Token...</h3>
                            <p>Please confirm the transaction in your wallet</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Success state — redesigned with TxTracker + confetti
    if (deployed && deployResult) {
        return (
            <div className="launch-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="launch-container">
                    {/* Celebration header */}
                    <div className="deploy-success-hero">
                        <div className="confetti-wrapper" aria-hidden="true">
                            {Array.from({ length: 16 }).map((_, i) => (
                                <span key={i} className={`confetti confetti-${i % 4}`} />
                            ))}
                        </div>
                        <div className="success-icon-ring">
                            <div className="success-icon-inner">
                                <Rocket size={36} />
                            </div>
                        </div>
                        <h1 className="deploy-success-title">
                            {formData.name} <span className="deploy-symbol-badge">${formData.symbol}</span>
                        </h1>
                        <p className="deploy-success-subtitle">Your token has been launched on {network}!</p>
                    </div>

                    {/* Token summary card */}
                    <div className="deploy-info-card">
                        <div className="deploy-info-grid">
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Supply</span>
                                <span className="deploy-info-value">{Number(formData.totalSupply).toLocaleString()}</span>
                            </div>
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Decimals</span>
                                <span className="deploy-info-value">{formData.decimals}</span>
                            </div>
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Burn</span>
                                <span className="deploy-info-value">{formData.burnEnabled ? 'Enabled' : 'Disabled'}</span>
                            </div>
                            <div className="deploy-info-item">
                                <span className="deploy-info-label">Free Mint</span>
                                <span className="deploy-info-value">{parseFloat(formData.freeMintSupply || 0) > 0 ? 'Yes' : 'No'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Address cards */}
                    <div className="deploy-addresses">
                        {deployResult.tokenAddress && (
                            <div className="deploy-address-card highlight">
                                <div className="deploy-address-header">
                                    <span className="deploy-address-label">Token Contract Address</span>
                                    <span className="deploy-address-badge">Save this!</span>
                                </div>
                                <div className="deploy-address-value">
                                    <AddressDisplay
                                        address={deployResult.tokenAddress}
                                        truncate={false}
                                        copyable={true}
                                    />
                                </div>
                            </div>
                        )}

                        {deployResult.txHash && (
                            <div className="deploy-address-card">
                                <div className="deploy-address-header">
                                    <span className="deploy-address-label">Transaction Hash</span>
                                </div>
                                <div className="deploy-address-value">
                                    <AddressDisplay
                                        address={deployResult.txHash}
                                        truncate={false}
                                        copyable={true}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Real-time Transaction Tracker */}
                    <TxTracker
                        txHash={deployResult.txHash}
                        onConfirmed={() => toast.success('Transaction confirmed on-chain!')}
                    />

                    {deployResult.warning && (
                        <div className="status-message warning mt-md">
                            <span>{deployResult.warning}</span>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="deploy-success-actions">
                        <Link to="/dashboard" className="btn btn-primary btn-lg">
                            <LayoutDashboard size={18} />
                            <span>View Dashboard</span>
                        </Link>
                        <Link to="/presale/create" className="btn btn-secondary">
                            <Plus size={18} />
                            <span>Create Presale</span>
                        </Link>
                        <button
                            className="btn btn-ghost"
                            onClick={() => {
                                setDeployed(false);
                                setDeployResult(null);
                                setCurrentStep(0);
                                setFormData({
                                    name: '', symbol: '', totalSupply: '', decimals: '8',
                                    preMintAmount: '', freeMintSupply: '', freeMintPerTx: '',
                                    freeMintUserCap: '', burnEnabled: false,
                                });
                            }}
                        >
                            <Plus size={18} />
                            <span>Deploy Another</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Calculate derived values for display
    const totalSupplyNum = parseFloat(formData.totalSupply || 0);
    const preMintNum = formData.preMintAmount ? parseFloat(formData.preMintAmount) : totalSupplyNum;
    const freeMintSupplyNum = parseFloat(formData.freeMintSupply || 0);
    const hasFreeMint = freeMintSupplyNum > 0;

    return (
        <div className="launch-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content" style={{ textAlign: 'center' }}>
                    <div className="page-hero-icon orange" style={{ margin: '0 auto var(--spacing-xs)' }}>
                        <Rocket size={28} />
                    </div>
                    <h1 className="page-hero-title">Launch Your Token</h1>
                    <p className="page-hero-subtitle" style={{ maxWidth: '400px', margin: '0 auto' }}>
                        Create an OP20 token on {network} in minutes
                    </p>
                </div>
            </section>

            <div className="launch-container">
                {/* Step Wizard */}
                <StepWizard
                    steps={STEPS}
                    currentStep={currentStep}
                    onStepClick={handleStepClick}
                />

                {/* Wizard Card */}
                <div className="wizard-card">
                    {/* Step 1: Token Info */}
                    {currentStep === 0 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Coins size={24} className="header-icon" /> Token Information</h2>
                                <p>Set the basic details for your token</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    Token Name <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    className={`form-input ${errors.name ? 'error' : ''}`}
                                    placeholder="e.g. Bitcoin Launch Token"
                                    value={formData.name}
                                    onChange={handleChange}
                                    maxLength={50}
                                />
                                {errors.name && <div className="form-error">{errors.name}</div>}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">
                                        Symbol <span className="required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="symbol"
                                        className={`form-input input-uppercase ${errors.symbol ? 'error' : ''}`}
                                        placeholder="e.g. BLT"
                                        value={formData.symbol}
                                        onChange={handleChange}
                                        maxLength={10}
                                    />
                                    {errors.symbol && <div className="form-error">{errors.symbol}</div>}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        Total Supply <span className="required">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        name="totalSupply"
                                        className={`form-input ${errors.totalSupply ? 'error' : ''}`}
                                        placeholder="e.g. 1000000"
                                        value={formData.totalSupply}
                                        onChange={handleChange}
                                        min="1"
                                    />
                                    {errors.totalSupply && <div className="form-error">{errors.totalSupply}</div>}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Pre-mint Amount</label>
                                <input
                                    type="number"
                                    name="preMintAmount"
                                    className={`form-input ${errors.preMintAmount ? 'error' : ''}`}
                                    placeholder="Leave empty to mint full supply"
                                    value={formData.preMintAmount}
                                    onChange={handleChange}
                                    min="0"
                                />
                                <div className="form-hint">
                                    Amount to mint to your wallet on deployment. Leave empty to mint the full total supply.
                                    {formData.preMintAmount && formData.totalSupply && (
                                        <> Unminted: {Math.max(0, totalSupplyNum - parseFloat(formData.preMintAmount)).toLocaleString()}</>
                                    )}
                                </div>
                                {errors.preMintAmount && <div className="form-error">{errors.preMintAmount}</div>}
                            </div>
                        </>
                    )}

                    {/* Step 2: Settings */}
                    {currentStep === 1 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Settings size={24} className="header-icon" /> Token Settings</h2>
                                <p>Configure token precision</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Decimals</label>
                                <input
                                    type="number"
                                    name="decimals"
                                    className={`form-input ${errors.decimals ? 'error' : ''}`}
                                    min="0"
                                    max="18"
                                    value={formData.decimals}
                                    readOnly
                                    disabled
                                />
                                <div className="form-hint">
                                    Standard is 18 for OP_NET tokens. This cannot be changed.
                                </div>
                                {errors.decimals && <div className="form-error">{errors.decimals}</div>}
                            </div>

                            <div className="info-box">
                                <h4>About Decimals</h4>
                                <p>
                                    Decimals define how divisible your token is. With 18 decimals,
                                    1 token = 1,000,000,000,000,000,000 smallest units. This is the
                                    standard for most tokens and ensures compatibility with wallets and exchanges.
                                </p>
                            </div>
                        </>
                    )}

                    {/* Step 3: Advanced */}
                    {currentStep === 2 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Zap size={24} className="header-icon" /> Advanced Options</h2>
                                <p>Configure free minting and burn functionality</p>
                            </div>

                            <div className="form-section-title">
                                <Gift size={18} />
                                <span>Free Mint Settings</span>
                            </div>
                            <div className="form-hint" style={{ marginBottom: 'var(--spacing-lg)' }}>
                                Allow anyone to mint tokens for free up to a set limit. Great for fair launches and community distribution.
                            </div>

                            <div className="form-group">
                                <label className="form-label">Free Mint Supply</label>
                                <input
                                    type="number"
                                    name="freeMintSupply"
                                    className={`form-input ${errors.freeMintSupply ? 'error' : ''}`}
                                    placeholder="0 (disabled)"
                                    value={formData.freeMintSupply}
                                    onChange={handleChange}
                                    min="0"
                                />
                                <div className="form-hint">
                                    Total tokens available for free minting. Set to 0 or leave empty to disable.
                                </div>
                                {errors.freeMintSupply && <div className="form-error">{errors.freeMintSupply}</div>}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Free Mint Per TX</label>
                                    <input
                                        type="number"
                                        name="freeMintPerTx"
                                        className={`form-input ${errors.freeMintPerTx ? 'error' : ''}`}
                                        placeholder="0"
                                        value={formData.freeMintPerTx}
                                        onChange={handleChange}
                                        min="0"
                                        disabled={!formData.freeMintSupply}
                                    />
                                    <div className="form-hint">Max tokens per mint transaction</div>
                                    {errors.freeMintPerTx && <div className="form-error">{errors.freeMintPerTx}</div>}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">User Mint Cap</label>
                                    <input
                                        type="number"
                                        name="freeMintUserCap"
                                        className={`form-input ${errors.freeMintUserCap ? 'error' : ''}`}
                                        placeholder="0 (no cap)"
                                        value={formData.freeMintUserCap}
                                        onChange={handleChange}
                                        min="0"
                                        disabled={!formData.freeMintSupply}
                                    />
                                    <div className="form-hint">Max total free mints per user</div>
                                    {errors.freeMintUserCap && <div className="form-error">{errors.freeMintUserCap}</div>}
                                </div>
                            </div>

                            <div className="form-divider" />

                            <div className="form-section-title">
                                <Flame size={18} />
                                <span>Burn Settings</span>
                            </div>

                            <div className="form-group">
                                <label className="form-checkbox">
                                    <input
                                        type="checkbox"
                                        name="burnEnabled"
                                        checked={formData.burnEnabled}
                                        onChange={handleChange}
                                    />
                                    <span>Enable Token Burning</span>
                                </label>
                                <div className="form-hint">
                                    When enabled, token holders can permanently destroy their tokens, reducing total supply.
                                    This is irreversible once tokens are burned.
                                </div>
                            </div>
                        </>
                    )}

                    {/* Step 4: Review */}
                    {currentStep === 3 && (
                        <>
                            <div className="wizard-card-header">
                                <h2><Eye size={24} className="header-icon" /> Review & Deploy</h2>
                                <p>Confirm your token details before deployment</p>
                            </div>

                            <div className="token-preview">
                                <div className="preview-header">
                                    <div className="preview-icon">
                                        {formData.symbol.substring(0, 2).toUpperCase() || '??'}
                                    </div>
                                    <div className="preview-info">
                                        <h3>{formData.name || 'Token Name'}</h3>
                                        <span className="symbol">${formData.symbol.toUpperCase() || 'SYM'}</span>
                                    </div>
                                </div>

                                <div className="preview-details">
                                    <div className="preview-item">
                                        <div className="preview-item-label">Total Supply</div>
                                        <div className="preview-item-value">
                                            {totalSupplyNum.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="preview-item">
                                        <div className="preview-item-label">Decimals</div>
                                        <div className="preview-item-value">{formData.decimals}</div>
                                    </div>
                                    <div className="preview-item">
                                        <div className="preview-item-label">Pre-mint To</div>
                                        <div className="preview-item-value preview-item-value--small">
                                            {address ? <AddressDisplay address={address} truncate={true} copyable={false} startChars={10} endChars={6} /> : '\u2014'}
                                        </div>
                                    </div>
                                    <div className="preview-item">
                                        <div className="preview-item-label">Pre-mint Amount</div>
                                        <div className="preview-item-value">
                                            {formData.preMintAmount
                                                ? parseFloat(formData.preMintAmount).toLocaleString()
                                                : totalSupplyNum.toLocaleString() + ' (full)'}
                                        </div>
                                    </div>
                                    <div className="preview-item">
                                        <div className="preview-item-label">Burnable</div>
                                        <div className="preview-item-value">
                                            {formData.burnEnabled ? (
                                                <span className="preview-badge preview-badge--active"><Flame size={14} /> Yes</span>
                                            ) : 'No'}
                                        </div>
                                    </div>
                                    <div className="preview-item">
                                        <div className="preview-item-label">Free Mint</div>
                                        <div className="preview-item-value">
                                            {hasFreeMint ? (
                                                <span className="preview-badge preview-badge--active"><Gift size={14} /> Enabled</span>
                                            ) : 'Disabled'}
                                        </div>
                                    </div>
                                </div>

                                {hasFreeMint && (
                                    <div className="preview-section">
                                        <h4 className="preview-section-title">Free Mint Configuration</h4>
                                        <div className="preview-details">
                                            <div className="preview-item">
                                                <div className="preview-item-label">Free Mint Supply</div>
                                                <div className="preview-item-value">
                                                    {freeMintSupplyNum.toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="preview-item">
                                                <div className="preview-item-label">Per Transaction</div>
                                                <div className="preview-item-value">
                                                    {formData.freeMintPerTx ? parseFloat(formData.freeMintPerTx).toLocaleString() : 'No limit'}
                                                </div>
                                            </div>
                                            <div className="preview-item">
                                                <div className="preview-item-label">Per User Cap</div>
                                                <div className="preview-item-value">
                                                    {formData.freeMintUserCap ? parseFloat(formData.freeMintUserCap).toLocaleString() : 'No cap'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="cost-breakdown">
                                    <h4 className="cost-header">Estimated Cost</h4>
                                    <div className="cost-row">
                                        <span className="cost-label">Network Fee</span>
                                        <span>~5,000 sats</span>
                                    </div>
                                    <div className="cost-row">
                                        <span className="cost-label">Platform Fee</span>
                                        <span>10,000 sats (0.0001 BTC)</span>
                                    </div>
                                    <div className="cost-total">
                                        <span>Total</span>
                                        <span>~15,000 sats</span>
                                    </div>
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
                            <Link to="/" className="btn btn-ghost">
                                <ArrowLeft size={18} />
                                <span>Cancel</span>
                            </Link>
                        )}

                        {currentStep < STEPS.length - 1 ? (
                            <button className="btn btn-primary" onClick={nextStep}>
                                <span>Continue</span>
                                <ArrowRight size={18} />
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={handleDeploy}
                            >
                                <Rocket size={18} />
                                <span>Deploy Token</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LaunchToken;
