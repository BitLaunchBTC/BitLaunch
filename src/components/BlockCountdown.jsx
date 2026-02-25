import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle } from 'lucide-react';
import { formatBlocksRemaining, blocksToHumanTime } from '../services/blockTime';

/**
 * Block-based countdown display component.
 * Shows remaining blocks and estimated time.
 *
 * @param {{
 *   targetBlock: number|bigint,
 *   currentBlock: number|bigint,
 *   label?: string,
 *   showBlocks?: boolean,
 *   size?: 'sm' | 'md' | 'lg',
 *   onComplete?: () => void
 * }} props
 */
const BlockCountdown = ({
    targetBlock,
    currentBlock,
    label,
    showBlocks = true,
    size = 'md',
    onComplete,
}) => {
    const [hasTriggered, setHasTriggered] = useState(false);

    const target = Number(targetBlock);
    const current = Number(currentBlock);
    const remaining = target - current;
    const isPassed = remaining <= 0;

    useEffect(() => {
        if (isPassed && !hasTriggered && onComplete) {
            setHasTriggered(true);
            onComplete();
        }
    }, [isPassed, hasTriggered, onComplete]);

    const timeString = formatBlocksRemaining(current, target);

    return (
        <div className={`block-countdown ${size} ${isPassed ? 'passed' : ''}`}>
            {isPassed ? (
                <CheckCircle size={size === 'sm' ? 14 : 16} className="block-countdown-icon passed" />
            ) : (
                <Clock size={size === 'sm' ? 14 : 16} className="block-countdown-icon" />
            )}
            <div className="block-countdown-content">
                {label && <span className="block-countdown-label">{label}</span>}
                <span className="block-countdown-time">{timeString}</span>
                {showBlocks && !isPassed && (
                    <span className="block-countdown-blocks">
                        {remaining.toLocaleString()} block{remaining !== 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </div>
    );
};

export default BlockCountdown;
