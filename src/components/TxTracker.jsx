// BitLaunch - Real-time Transaction Tracker Component
// Polls OPNet mempool/receipt for live confirmation status
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { opnetProvider } from '../services/opnetProvider';
import { Clock, Loader, CheckCircle2, XCircle, Radio, Cpu, Box } from 'lucide-react';
import '../styles/txtracker.css';

const STATUS = {
    BROADCASTING: 'broadcasting',
    MEMPOOL: 'mempool',
    CONFIRMED: 'confirmed',
    FAILED: 'failed',
    UNKNOWN: 'unknown',
};

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLLS = 120;      // 10 minutes max

/**
 * Real-time transaction confirmation tracker.
 *
 * @param {{
 *   txHash: string|null,
 *   onConfirmed?: (receipt) => void,
 *   compact?: boolean,
 * }} props
 */
const TxTracker = ({ txHash, onConfirmed, compact = false }) => {
    const [status, setStatus] = useState(txHash ? STATUS.BROADCASTING : STATUS.UNKNOWN);
    const [receipt, setReceipt] = useState(null);
    const [pollCount, setPollCount] = useState(0);
    const [elapsedSec, setElapsedSec] = useState(0);
    const intervalRef = useRef(null);
    const timerRef = useRef(null);
    const confirmedRef = useRef(false);

    const checkStatus = useCallback(async () => {
        if (!txHash || confirmedRef.current) return;

        const provider = opnetProvider.getProvider();
        if (!provider) return;

        try {
            // 1) Try getTransactionReceipt — if found, tx is confirmed
            try {
                const rcpt = await provider.getTransactionReceipt(txHash);
                if (rcpt && !rcpt.revert) {
                    setStatus(STATUS.CONFIRMED);
                    setReceipt(rcpt);
                    confirmedRef.current = true;
                    if (onConfirmed) onConfirmed(rcpt);
                    return;
                }
            } catch {
                // Not confirmed yet — that's fine
            }

            // 2) Check if tx is in mempool
            try {
                const pending = await provider.getPendingTransaction(txHash);
                if (pending) {
                    setStatus(STATUS.MEMPOOL);
                    return;
                }
            } catch {
                // Not in mempool either
            }

            // 3) If we were in mempool before but now gone — might be confirmed or dropped
            if (status === STATUS.MEMPOOL) {
                // Try receipt one more time
                try {
                    const rcpt = await provider.getTransactionReceipt(txHash);
                    if (rcpt && !rcpt.revert) {
                        setStatus(STATUS.CONFIRMED);
                        setReceipt(rcpt);
                        confirmedRef.current = true;
                        if (onConfirmed) onConfirmed(rcpt);
                        return;
                    }
                } catch {}
            }

            setPollCount(prev => prev + 1);
        } catch (err) {
            console.warn('TxTracker poll error:', err.message);
        }
    }, [txHash, status, onConfirmed]);

    // Start polling
    useEffect(() => {
        if (!txHash) return;

        // Initial check
        const timeout = setTimeout(() => checkStatus(), 2000);

        // Poll every POLL_INTERVAL
        intervalRef.current = setInterval(() => {
            if (confirmedRef.current) {
                clearInterval(intervalRef.current);
                return;
            }
            checkStatus();
        }, POLL_INTERVAL);

        // Elapsed timer
        timerRef.current = setInterval(() => {
            if (!confirmedRef.current) {
                setElapsedSec(prev => prev + 1);
            }
        }, 1000);

        return () => {
            clearTimeout(timeout);
            clearInterval(intervalRef.current);
            clearInterval(timerRef.current);
        };
    }, [txHash, checkStatus]);

    // Stop polling after max
    useEffect(() => {
        if (pollCount >= MAX_POLLS && !confirmedRef.current) {
            clearInterval(intervalRef.current);
            setStatus(STATUS.UNKNOWN);
        }
    }, [pollCount]);

    if (!txHash && status !== STATUS.UNKNOWN) return null;

    const formatTime = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const steps = [
        { key: 'broadcast', label: 'Broadcast', icon: Radio },
        { key: 'mempool', label: 'Mempool', icon: Cpu },
        { key: 'confirmed', label: 'Confirmed', icon: Box },
    ];

    const activeIndex =
        status === STATUS.CONFIRMED ? 3
        : status === STATUS.MEMPOOL ? 2
        : status === STATUS.BROADCASTING ? 1
        : 0;

    if (compact) {
        return (
            <div className={`tx-tracker-compact status-${status}`}>
                {status === STATUS.BROADCASTING && (
                    <><Loader size={14} className="spinning" /> Broadcasting...</>
                )}
                {status === STATUS.MEMPOOL && (
                    <><Radio size={14} className="pulse-icon" /> In mempool — waiting for block...</>
                )}
                {status === STATUS.CONFIRMED && (
                    <><CheckCircle2 size={14} /> Confirmed!</>
                )}
                {status === STATUS.FAILED && (
                    <><XCircle size={14} /> Failed</>
                )}
                {status === STATUS.UNKNOWN && !txHash && (
                    <><Clock size={14} /> Pending...</>
                )}
                {elapsedSec > 0 && status !== STATUS.CONFIRMED && (
                    <span className="tx-tracker-elapsed">{formatTime(elapsedSec)}</span>
                )}
            </div>
        );
    }

    return (
        <div className={`tx-tracker status-${status}`}>
            <div className="tx-tracker-header">
                <h4>Transaction Status</h4>
                {elapsedSec > 0 && status !== STATUS.CONFIRMED && (
                    <span className="tx-tracker-elapsed">
                        <Clock size={14} /> {formatTime(elapsedSec)}
                    </span>
                )}
            </div>

            {/* Progress pipeline */}
            <div className="tx-pipeline">
                {steps.map((step, i) => {
                    const StepIcon = step.icon;
                    const isComplete = i < activeIndex;
                    const isActive = i === activeIndex - 1;
                    const isPending = i >= activeIndex;

                    return (
                        <React.Fragment key={step.key}>
                            <div className={`tx-pipeline-step ${isComplete ? 'complete' : ''} ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}>
                                <div className="tx-pipeline-icon">
                                    {isComplete ? (
                                        <CheckCircle2 size={20} />
                                    ) : isActive ? (
                                        <StepIcon size={20} className="pulse-icon" />
                                    ) : (
                                        <StepIcon size={20} />
                                    )}
                                </div>
                                <span className="tx-pipeline-label">{step.label}</span>
                            </div>
                            {i < steps.length - 1 && (
                                <div className={`tx-pipeline-line ${isComplete ? 'complete' : ''}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Status message */}
            <div className="tx-tracker-message">
                {status === STATUS.BROADCASTING && (
                    <p>Transaction sent to the network. Waiting for mempool acceptance...</p>
                )}
                {status === STATUS.MEMPOOL && (
                    <p>Transaction is in the mempool. Waiting for next block confirmation (~10 min avg)...</p>
                )}
                {status === STATUS.CONFIRMED && (
                    <p className="text-green">Transaction confirmed on-chain!</p>
                )}
                {status === STATUS.UNKNOWN && !txHash && (
                    <p>Transaction was broadcast but hash is unknown. Check your wallet for status.</p>
                )}
            </div>
        </div>
    );
};

export default TxTracker;
