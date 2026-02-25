// BitLaunch - Liquidity Lock Page (V2)
// V2 changes: block-based unlock, partial unlock, lock ownership transfer, shared components
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/Toast';
import { liquidityLockService } from '../services/LiquidityLockService';
import { recordTransaction, TX_TYPES } from '../services/txHistory';
import { opnetProvider } from '../services/opnetProvider';
import { blocksToHumanTime } from '../services/blockTime';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import BlockCountdown from '../components/BlockCountdown';
import ProgressBar from '../components/ProgressBar';
import AddressDisplay from '../components/AddressDisplay';
import { Lock, Search, Shield, Info, Wallet, Unlock, ArrowRightLeft, Scissors } from 'lucide-react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import '../styles/liquidity.css';

const LiquidityLock = () => {
    const { connected, connect, address } = useWallet();
    const toast = useToast();
    useScrollAnimation();
    const [searchQuery, setSearchQuery] = useState('');
    const [pairInfo, setPairInfo] = useState(null);
    const [lockAmount, setLockAmount] = useState('');
    const [unlockBlockOffset, setUnlockBlockOffset] = useState('');
    const [locking, setLocking] = useState(false);
    const [lockingMessage, setLockingMessage] = useState('');
    const [myLocks, setMyLocks] = useState([]);
    const [loadingLocks, setLoadingLocks] = useState(false);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [searching, setSearching] = useState(false);

    // V2: Partial unlock state
    const [partialUnlockId, setPartialUnlockId] = useState(null);
    const [partialAmount, setPartialAmount] = useState('');
    // V2: Transfer ownership state
    const [transferId, setTransferId] = useState(null);
    const [transferAddress, setTransferAddress] = useState('');

    const fetchCurrentBlock = useCallback(async () => {
        try {
            const p = opnetProvider.getProvider();
            if (p && p.getBlockNumber) {
                const num = await p.getBlockNumber();
                setCurrentBlock(Number(num));
            }
        } catch {}
    }, []);

    const loadMyLocks = useCallback(async () => {
        if (address) {
            setLoadingLocks(true);
            try {
                await fetchCurrentBlock();
                const locks = await liquidityLockService.getLocksForOwner(address);
                setMyLocks(locks);
            } catch (err) {
                console.error('Failed to load locks:', err);
                setMyLocks([]);
            } finally {
                setLoadingLocks(false);
            }
        }
    }, [address, fetchCurrentBlock]);

    useEffect(() => {
        loadMyLocks();
    }, [loadMyLocks]);

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            toast.error('Please enter a token address');
            return;
        }
        setSearching(true);
        try {
            const tokenInfo = await liquidityLockService.fetchTokenInfo(searchQuery);
            let userBalance = '0';
            if (address) {
                userBalance = await liquidityLockService.getTokenBalance(searchQuery, address);
            }

            setPairInfo({
                symbol0: tokenInfo.symbol,
                symbol1: tokenInfo.name,
                lpBalance: userBalance,
                totalSupply: tokenInfo.totalSupply,
                decimals: tokenInfo.decimals,
                tokenAddress: searchQuery,
            });
        } catch (err) {
            console.error('Search failed:', err);
            toast.error('Token not found. Check the address and try again.');
            setPairInfo(null);
        } finally {
            setSearching(false);
        }
    };

    const handleMax = () => {
        if (pairInfo) {
            setLockAmount(pairInfo.lpBalance);
        }
    };

    // V2: Block-based lock
    const handleLockLiquidity = async () => {
        if (!lockAmount || parseFloat(lockAmount) <= 0) {
            toast.error('Please enter an amount to lock');
            return;
        }
        if (!unlockBlockOffset || parseInt(unlockBlockOffset) <= 0) {
            toast.error('Please enter a valid unlock duration in blocks');
            return;
        }

        const unlockBlock = currentBlock + parseInt(unlockBlockOffset);

        setLocking(true);
        setLockingMessage('Preparing lock...');
        try {
            const lockResult = await liquidityLockService.lockTokens({
                tokenAddress: pairInfo?.tokenAddress || searchQuery,
                amount: lockAmount,
                unlockBlock,
                owner: address,
            }, (msg) => setLockingMessage(msg));
            recordTransaction({
                type: TX_TYPES.LOCK_TOKENS,
                txHash: lockResult?.txHash || null,
                address,
                details: {
                    tokenAddress: pairInfo?.tokenAddress || searchQuery,
                    amount: lockAmount,
                    unlockBlock,
                    tokenSymbol: pairInfo?.symbol0,
                },
                status: 'pending',
            });
            toast.success('Liquidity locked successfully!');
            setLockAmount('');
            setUnlockBlockOffset('');
            setPairInfo(null);
            setSearchQuery('');
            await loadMyLocks();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLocking(false);
        }
    };

    const handleUnlock = async (lockId) => {
        try {
            const unlockResult = await liquidityLockService.unlockTokens(lockId, address);
            recordTransaction({
                type: TX_TYPES.UNLOCK_TOKENS,
                txHash: unlockResult?.txHash || null,
                address,
                details: { lockId },
                status: 'pending',
            });
            toast.success('Tokens unlocked!');
            await loadMyLocks();
        } catch (error) {
            toast.error(error.message);
        }
    };

    // V2: Partial unlock
    const handlePartialUnlock = async () => {
        if (!partialAmount || parseFloat(partialAmount) <= 0) {
            toast.error('Enter a valid partial unlock amount');
            return;
        }
        try {
            const partialResult = await liquidityLockService.partialUnlock(partialUnlockId, partialAmount, address);
            recordTransaction({
                type: TX_TYPES.PARTIAL_UNLOCK,
                txHash: partialResult?.txHash || null,
                address,
                details: { lockId: partialUnlockId, amount: partialAmount },
                status: 'pending',
            });
            toast.success('Partial unlock successful!');
            setPartialUnlockId(null);
            setPartialAmount('');
            await loadMyLocks();
        } catch (error) {
            toast.error(error.message);
        }
    };

    // V2: Transfer lock ownership
    const handleTransferOwnership = async () => {
        if (!transferAddress.trim()) {
            toast.error('Enter a valid address');
            return;
        }
        try {
            const transferResult = await liquidityLockService.transferLockOwnership(transferId, transferAddress, address);
            recordTransaction({
                type: TX_TYPES.TRANSFER_LOCK,
                txHash: transferResult?.txHash || null,
                address,
                details: { lockId: transferId, newOwner: transferAddress },
                status: 'pending',
            });
            toast.success('Lock ownership transferred!');
            setTransferId(null);
            setTransferAddress('');
            await loadMyLocks();
        } catch (error) {
            toast.error(error.message);
        }
    };

    // Wallet gate
    if (!connected) {
        return (
            <div className="liquidity-page page-transition">
                <section className="page-hero">
                    <div className="page-hero-orb orb-1" />
                    <div className="page-hero-orb orb-2" />
                    <div className="page-hero-grid" />
                </section>
                <div className="liquidity-container">
                    <EmptyState
                        icon={Wallet}
                        title="Connect Your Wallet"
                        description="Connect your wallet to lock liquidity"
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

    const unlockBlockOffsetNum = parseInt(unlockBlockOffset) || 0;

    return (
        <div className="liquidity-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="page-hero-icon blue">
                        <Lock size={28} />
                    </div>
                    <h1 className="page-hero-title">Liquidity Lock</h1>
                    <p className="page-hero-subtitle">Lock tokens to build trust</p>
                </div>
            </section>

            <div className="liquidity-container">
                <div className="lock-card animate-on-scroll">
                    <div className="pair-search">
                        <input
                            type="text"
                            className="pair-search-input"
                            placeholder="Enter token or LP token address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <button className="search-btn" onClick={handleSearch} disabled={searching}>
                            {searching ? <div className="loading-spinner" style={{ width: 18, height: 18 }}></div> : <Search size={18} />}
                        </button>
                    </div>

                    {!pairInfo ? (
                        <div className="text-center text-muted py-xl">
                            <Shield size={48} className="mx-auto mb-md opacity-20" />
                            <p>Enter a token address to fetch details and lock tokens.</p>
                        </div>
                    ) : (
                        <div className="lock-content animation-fadeIn">
                            <div className="pair-info">
                                <div className="pair-title">
                                    <div className="pair-icons">
                                        <div className="token-icon-overlap bg-orange-500">{pairInfo.symbol0[0]}</div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg">{pairInfo.symbol1} ({pairInfo.symbol0})</h3>
                                        <span className="text-sm text-muted">OP20 Token</span>
                                    </div>
                                </div>
                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">Your Balance:</span>
                                    <span className="font-mono font-bold">{pairInfo.lpBalance} {pairInfo.symbol0}</span>
                                </div>
                            </div>

                            {currentBlock > 0 && (
                                <div className="block-info-banner">
                                    Current block: <strong>#{currentBlock.toLocaleString()}</strong>
                                </div>
                            )}

                            <form className="lock-form" onSubmit={(e) => e.preventDefault()}>
                                <div className="form-group">
                                    <label className="form-label">Amount to Lock</label>
                                    <div className="amount-input-group">
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={lockAmount}
                                            onChange={(e) => setLockAmount(e.target.value)}
                                        />
                                        <span className="max-btn" onClick={handleMax} role="button" tabIndex={0}>MAX</span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Lock Duration (blocks)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="e.g. 4320 (~30 days)"
                                        value={unlockBlockOffset}
                                        onChange={(e) => setUnlockBlockOffset(e.target.value)}
                                        min="1"
                                    />
                                    <div className="form-hint">
                                        144 blocks = ~1 day, 1008 = ~1 week, 4320 = ~30 days.
                                        {unlockBlockOffsetNum > 0 && (
                                            <> Unlocks at block #{(currentBlock + unlockBlockOffsetNum).toLocaleString()} ({blocksToHumanTime(unlockBlockOffsetNum)})</>
                                        )}
                                    </div>
                                </div>

                                <div className="info-banner">
                                    <Info size={16} />
                                    <span>
                                        Tokens will be locked in a smart contract. You can withdraw only after the unlock block.
                                        A 0.5% platform fee applies on lock.
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-primary w-full mt-md"
                                    onClick={handleLockLiquidity}
                                    disabled={locking}
                                >
                                    <Lock size={18} />
                                    <span>{locking ? (lockingMessage || 'Locking...') : 'Lock Liquidity'}</span>
                                </button>
                            </form>
                        </div>
                    )}
                </div>

                {/* My Locks Section */}
                <div className="my-locks-section animate-on-scroll">
                    <h2 className="text-xl mb-lg">My Locks</h2>

                    {loadingLocks ? (
                        <div className="text-center text-muted py-xl">
                            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                            <p>Loading locks from chain...</p>
                        </div>
                    ) : myLocks.length === 0 ? (
                        <EmptyState
                            icon={Lock}
                            title="No Locks"
                            description="Lock liquidity above to get started"
                            size="sm"
                        />
                    ) : (
                        <div className="locks-grid">
                            {myLocks.map(lock => {
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
                                    <div key={lock.id} className="lock-item-v2">
                                        <div className="lock-item-header">
                                            <div className="flex items-center gap-md">
                                                <div className="token-icon-sm bg-purple-500">L</div>
                                                <div>
                                                    <div className="font-bold">Lock #{lock.id}</div>
                                                    <AddressDisplay
                                                        address={lock.token?.toString() || ''}
                                                        truncate={true}
                                                        copyable={false}
                                                        startChars={8}
                                                        endChars={4}
                                                    />
                                                </div>
                                            </div>
                                            <StatusBadge status={statusMap[status] || 'locked'} size="sm" />
                                        </div>

                                        <div className="lock-item-stats">
                                            <div className="vesting-info-row">
                                                <span className="vesting-label">Locked</span>
                                                <span className="vesting-value">{totalNum.toLocaleString()}</span>
                                            </div>
                                            <div className="vesting-info-row">
                                                <span className="vesting-label">Remaining</span>
                                                <span className="vesting-value">{remainingNum.toLocaleString()}</span>
                                            </div>
                                            {withdrawnNum > 0 && (
                                                <div className="vesting-info-row">
                                                    <span className="vesting-label">Withdrawn</span>
                                                    <span className="vesting-value">{withdrawnNum.toLocaleString()}</span>
                                                </div>
                                            )}
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

                                        {/* Actions */}
                                        <div className="lock-item-actions">
                                            {status === 'unlockable' && (
                                                <>
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => handleUnlock(lock.id)}
                                                    >
                                                        <Unlock size={14} /> Withdraw All
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setPartialUnlockId(partialUnlockId === lock.id ? null : lock.id)}
                                                    >
                                                        <Scissors size={14} /> Partial
                                                    </button>
                                                </>
                                            )}
                                            {status !== 'withdrawn' && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => setTransferId(transferId === lock.id ? null : lock.id)}
                                                >
                                                    <ArrowRightLeft size={14} /> Transfer
                                                </button>
                                            )}
                                        </div>

                                        {/* V2: Partial Unlock Form */}
                                        {partialUnlockId === lock.id && (
                                            <div className="lock-inline-form">
                                                <input
                                                    type="number"
                                                    className="form-input form-input-sm"
                                                    placeholder="Amount to unlock"
                                                    value={partialAmount}
                                                    onChange={(e) => setPartialAmount(e.target.value)}
                                                />
                                                <button className="btn btn-primary btn-sm" onClick={handlePartialUnlock}>
                                                    Unlock
                                                </button>
                                            </div>
                                        )}

                                        {/* V2: Transfer Ownership Form */}
                                        {transferId === lock.id && (
                                            <div className="lock-inline-form">
                                                <input
                                                    type="text"
                                                    className="form-input form-input-sm"
                                                    placeholder="New owner address"
                                                    value={transferAddress}
                                                    onChange={(e) => setTransferAddress(e.target.value)}
                                                />
                                                <button className="btn btn-primary btn-sm" onClick={handleTransferOwnership}>
                                                    Transfer
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LiquidityLock;
