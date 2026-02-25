// Block-time utilities for OPNet (Bitcoin L1)
// Average block time: ~10 minutes (600 seconds)

const AVG_BLOCK_TIME_MS = 10 * 60 * 1000; // 600,000 ms
const AVG_BLOCK_TIME_SECS = 600;

/**
 * Convert a number of blocks into milliseconds.
 * @param {number|bigint} blocks
 * @returns {number} milliseconds
 */
export function blocksToMs(blocks) {
    return Number(blocks) * AVG_BLOCK_TIME_MS;
}

/**
 * Convert milliseconds to an estimated block count.
 * @param {number} ms
 * @returns {number} blocks (rounded up)
 */
export function msToBlocks(ms) {
    return Math.ceil(ms / AVG_BLOCK_TIME_MS);
}

/**
 * Convert a duration in days/hours/minutes to an estimated block count.
 * @param {{ days?: number, hours?: number, minutes?: number }} duration
 * @returns {number} blocks
 */
export function durationToBlocks({ days = 0, hours = 0, minutes = 0 }) {
    const totalMs = ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
    return msToBlocks(totalMs);
}

/**
 * Convert a block count into a human-readable duration string.
 * e.g. "2 days, 4 hours" or "30 minutes"
 * @param {number|bigint} blocks
 * @returns {string}
 */
export function blocksToHumanTime(blocks) {
    const totalSecs = Number(blocks) * AVG_BLOCK_TIME_SECS;

    if (totalSecs < 60) return 'less than a minute';

    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0 && days === 0) parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);

    return parts.join(', ') || 'less than a minute';
}

/**
 * Format the remaining time from current block to target block.
 * @param {number|bigint} currentBlock
 * @param {number|bigint} targetBlock
 * @returns {string} e.g. "~3 days, 2 hours" or "Passed" or "Now"
 */
export function formatBlocksRemaining(currentBlock, targetBlock) {
    const current = Number(currentBlock);
    const target = Number(targetBlock);
    const diff = target - current;

    if (diff <= 0) return 'Passed';
    if (diff === 1) return '~10 minutes';

    return `~${blocksToHumanTime(diff)}`;
}

/**
 * Estimate a future block number from a JavaScript Date.
 * @param {Date} targetDate
 * @param {number|bigint} currentBlock
 * @returns {number} estimated block number
 */
export function dateToBlock(targetDate, currentBlock) {
    const now = Date.now();
    const targetMs = targetDate.getTime();
    const diffMs = targetMs - now;

    if (diffMs <= 0) return Number(currentBlock);

    return Number(currentBlock) + msToBlocks(diffMs);
}

/**
 * Estimate a Date from a future block number.
 * @param {number|bigint} targetBlock
 * @param {number|bigint} currentBlock
 * @returns {Date}
 */
export function blockToDate(targetBlock, currentBlock) {
    const diff = Number(targetBlock) - Number(currentBlock);
    return new Date(Date.now() + diff * AVG_BLOCK_TIME_MS);
}

/**
 * Format a block number with optional "in X blocks" annotation.
 * @param {number|bigint} blockNumber
 * @param {number|bigint} [currentBlock]
 * @returns {string}
 */
export function formatBlockNumber(blockNumber, currentBlock) {
    const block = Number(blockNumber);
    const formatted = block.toLocaleString();

    if (currentBlock != null) {
        const diff = block - Number(currentBlock);
        if (diff > 0) {
            return `Block ${formatted} (~${blocksToHumanTime(diff)})`;
        }
        if (diff === 0) return `Block ${formatted} (now)`;
        return `Block ${formatted} (passed)`;
    }

    return `Block ${formatted}`;
}

export { AVG_BLOCK_TIME_MS, AVG_BLOCK_TIME_SECS };
