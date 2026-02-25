import React from 'react';
import { formatTokenAmount } from '../services/formatters';

/**
 * Token amount display with automatic formatting and optional symbol.
 *
 * @param {{
 *   amount: bigint|string|number,
 *   decimals?: number,
 *   symbol?: string,
 *   precision?: number,
 *   size?: 'sm' | 'md' | 'lg',
 *   mono?: boolean,
 *   className?: string
 * }} props
 */
const TokenAmount = ({
    amount,
    decimals = 8,
    symbol,
    precision = 4,
    size = 'md',
    mono = true,
    className = '',
}) => {
    const formatted = formatTokenAmount(amount, decimals, precision);

    return (
        <span className={`token-amount ${size} ${mono ? 'font-mono' : ''} ${className}`}>
            <span className="token-amount-value">{formatted}</span>
            {symbol && <span className="token-amount-symbol"> {symbol}</span>}
        </span>
    );
};

export default TokenAmount;
