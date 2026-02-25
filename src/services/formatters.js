// Shared formatting utilities for BitLaunch

/**
 * Format a raw token amount with decimals.
 * Handles both BigInt and string input.
 * @param {bigint|string|number} amount - Raw amount (in smallest unit)
 * @param {number} [decimals=8] - Token decimals
 * @param {number} [precision=4] - Display precision
 * @returns {string} Formatted amount e.g. "1,234.5678"
 */
export function formatTokenAmount(amount, decimals = 8, precision = 4) {
    if (amount == null) return '0';

    try {
        const raw = BigInt(amount);
        const divisor = BigInt(10 ** decimals);
        const whole = raw / divisor;
        const remainder = raw % divisor;

        if (remainder === 0n) {
            return whole.toLocaleString();
        }

        // Build decimal portion with leading zeros
        const remainderStr = remainder.toString().padStart(decimals, '0');
        const trimmed = remainderStr.slice(0, precision).replace(/0+$/, '');

        if (!trimmed) {
            return whole.toLocaleString();
        }

        return `${whole.toLocaleString()}.${trimmed}`;
    } catch {
        return String(amount);
    }
}

/**
 * Format a Bitcoin address for display (truncated).
 * @param {string} address
 * @param {number} [startChars=8]
 * @param {number} [endChars=6]
 * @returns {string} e.g. "opt1sqrx...r7a2q"
 */
export function formatAddress(address, startChars = 8, endChars = 6) {
    if (!address) return '';
    if (address.length <= startChars + endChars + 3) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format a number with commas and optional decimal precision.
 * @param {number|string|bigint} value
 * @param {number} [precision=2]
 * @returns {string}
 */
export function formatNumber(value, precision = 2) {
    if (value == null) return '0';

    const num = Number(value);
    if (isNaN(num)) return String(value);

    if (num >= 1_000_000_000) {
        return `${(num / 1_000_000_000).toFixed(precision)}B`;
    }
    if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(precision)}M`;
    }
    if (num >= 1_000) {
        return `${(num / 1_000).toFixed(precision)}K`;
    }

    return num.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: precision,
    });
}

/**
 * Format basis points to a percentage string.
 * @param {number|bigint|string} bps - Basis points (100 = 1%)
 * @returns {string} e.g. "2.5%"
 */
export function formatBps(bps) {
    const value = Number(bps);
    const pct = value / 100;

    if (pct === Math.floor(pct)) {
        return `${pct}%`;
    }
    return `${pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/**
 * Format satoshi amount to BTC display.
 * @param {number|bigint|string} sats
 * @param {number} [precision=8]
 * @returns {string} e.g. "0.001 BTC"
 */
export function formatSatoshis(sats, precision = 8) {
    const value = Number(sats);
    const btc = value / 100_000_000;

    if (btc === 0) return '0 BTC';

    return `${btc.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '')} BTC`;
}

/**
 * Format a percentage with fixed precision.
 * @param {number} value - Percentage value (e.g. 75.5)
 * @param {number} [precision=1]
 * @returns {string} e.g. "75.5%"
 */
export function formatPercentage(value, precision = 1) {
    if (value == null || isNaN(value)) return '0%';
    return `${Number(value).toFixed(precision).replace(/\.?0+$/, '')}%`;
}

/**
 * Parse a user-entered token amount to raw BigInt.
 * @param {string} displayAmount - e.g. "1234.5678"
 * @param {number} [decimals=8]
 * @returns {bigint}
 */
export function parseTokenAmount(displayAmount, decimals = 8) {
    if (!displayAmount) return 0n;

    const str = String(displayAmount).trim().replace(/,/g, '');
    const [whole = '0', frac = ''] = str.split('.');
    const paddedFrac = frac.slice(0, decimals).padEnd(decimals, '0');

    return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFrac);
}
