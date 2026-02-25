// Shared form validation utilities for BitLaunch

/**
 * Validate that a value is not empty.
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateRequired(value, fieldName) {
    if (value == null || String(value).trim() === '') {
        return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
}

/**
 * Validate that a value is a positive number.
 * @param {string|number} value
 * @param {string} fieldName
 * @param {{ allowZero?: boolean, max?: number }} [options]
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePositiveNumber(value, fieldName, options = {}) {
    const num = Number(value);

    if (isNaN(num)) {
        return { valid: false, error: `${fieldName} must be a valid number` };
    }

    if (options.allowZero ? num < 0 : num <= 0) {
        return { valid: false, error: `${fieldName} must be ${options.allowZero ? 'zero or ' : ''}greater than zero` };
    }

    if (options.max != null && num > options.max) {
        return { valid: false, error: `${fieldName} must not exceed ${options.max}` };
    }

    return { valid: true };
}

/**
 * Validate that a string looks like an OPNet address.
 * @param {string} address
 * @param {string} [fieldName='Address']
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAddress(address, fieldName = 'Address') {
    if (!address || String(address).trim() === '') {
        return { valid: false, error: `${fieldName} is required` };
    }

    const trimmed = String(address).trim();

    // OPNet testnet addresses start with opt1, regtest with opr1, mainnet with op1
    const validPrefixes = ['opt1', 'opr1', 'op1', 'bcrt1', 'bc1', 'tb1'];
    const hasValidPrefix = validPrefixes.some((prefix) => trimmed.startsWith(prefix));

    if (!hasValidPrefix) {
        return { valid: false, error: `${fieldName} must be a valid Bitcoin/OPNet address` };
    }

    if (trimmed.length < 30) {
        return { valid: false, error: `${fieldName} is too short` };
    }

    return { valid: true };
}

/**
 * Validate that a block number is in the future.
 * @param {number|string} blockNumber
 * @param {number} currentBlock
 * @param {string} [fieldName='Block']
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFutureBlock(blockNumber, currentBlock, fieldName = 'Block') {
    const block = Number(blockNumber);

    if (isNaN(block) || !Number.isInteger(block) || block <= 0) {
        return { valid: false, error: `${fieldName} must be a valid block number` };
    }

    if (block <= currentBlock) {
        return { valid: false, error: `${fieldName} must be in the future (current: ${currentBlock})` };
    }

    return { valid: true };
}

/**
 * Validate basis points (0-10000).
 * @param {number|string} bps
 * @param {string} [fieldName='Fee']
 * @param {{ maxBps?: number }} [options]
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBps(bps, fieldName = 'Fee', options = {}) {
    const value = Number(bps);
    const maxBps = options.maxBps || 10000;

    if (isNaN(value) || !Number.isInteger(value)) {
        return { valid: false, error: `${fieldName} must be a whole number` };
    }

    if (value < 0) {
        return { valid: false, error: `${fieldName} cannot be negative` };
    }

    if (value > maxBps) {
        return {
            valid: false,
            error: `${fieldName} cannot exceed ${maxBps} bps (${maxBps / 100}%)`,
        };
    }

    return { valid: true };
}

/**
 * Validate a BigInt amount against a balance.
 * @param {bigint|string} amount
 * @param {bigint|string} balance
 * @param {string} [fieldName='Amount']
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSufficientBalance(amount, balance, fieldName = 'Amount') {
    try {
        const amt = BigInt(amount);
        const bal = BigInt(balance);

        if (amt <= 0n) {
            return { valid: false, error: `${fieldName} must be greater than zero` };
        }

        if (amt > bal) {
            return { valid: false, error: `Insufficient balance for ${fieldName.toLowerCase()}` };
        }

        return { valid: true };
    } catch {
        return { valid: false, error: `${fieldName} is not a valid amount` };
    }
}

/**
 * Run multiple validations and return the first error.
 * @param {Array<() => { valid: boolean, error?: string }>} validations
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAll(validations) {
    for (const validate of validations) {
        const result = validate();
        if (!result.valid) return result;
    }
    return { valid: true };
}
