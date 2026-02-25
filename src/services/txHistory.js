// BitLaunch - Transaction History Service
// Persists transaction records in localStorage for dashboard display.

const STORAGE_KEY = 'bitlaunch_tx_history';
const MAX_ENTRIES = 100;

/**
 * Transaction types
 */
export const TX_TYPES = {
    DEPLOY_TOKEN: 'deploy_token',
    CREATE_PRESALE: 'create_presale',
    CONTRIBUTE: 'contribute',
    FINALIZE_PRESALE: 'finalize_presale',
    REFUND: 'refund',
    CREATE_VESTING: 'create_vesting',
    CLAIM_VESTING: 'claim_vesting',
    REVOKE_VESTING: 'revoke_vesting',
    LOCK_TOKENS: 'lock_tokens',
    UNLOCK_TOKENS: 'unlock_tokens',
    PARTIAL_UNLOCK: 'partial_unlock',
    TRANSFER_LOCK: 'transfer_lock',
    CREATE_AIRDROP: 'create_airdrop',
    CLAIM_AIRDROP: 'claim_airdrop',
    CANCEL_AIRDROP: 'cancel_airdrop',
    APPROVE: 'approve',
    TRANSFER: 'transfer',
};

/**
 * Human-readable labels for tx types
 */
export const TX_LABELS = {
    [TX_TYPES.DEPLOY_TOKEN]: 'Deploy Token',
    [TX_TYPES.CREATE_PRESALE]: 'Create Presale',
    [TX_TYPES.CONTRIBUTE]: 'Presale Contribution',
    [TX_TYPES.FINALIZE_PRESALE]: 'Finalize Presale',
    [TX_TYPES.REFUND]: 'Presale Refund',
    [TX_TYPES.CREATE_VESTING]: 'Create Vesting',
    [TX_TYPES.CLAIM_VESTING]: 'Claim Vesting',
    [TX_TYPES.REVOKE_VESTING]: 'Revoke Vesting',
    [TX_TYPES.LOCK_TOKENS]: 'Lock Tokens',
    [TX_TYPES.UNLOCK_TOKENS]: 'Unlock Tokens',
    [TX_TYPES.PARTIAL_UNLOCK]: 'Partial Unlock',
    [TX_TYPES.TRANSFER_LOCK]: 'Transfer Lock',
    [TX_TYPES.CREATE_AIRDROP]: 'Create Airdrop',
    [TX_TYPES.CLAIM_AIRDROP]: 'Claim Airdrop',
    [TX_TYPES.CANCEL_AIRDROP]: 'Cancel Airdrop',
    [TX_TYPES.APPROVE]: 'Token Approval',
    [TX_TYPES.TRANSFER]: 'Token Transfer',
};

function getStore() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveStore(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/**
 * Record a new transaction.
 * @param {{
 *   type: string,
 *   txHash: string|null,
 *   address: string,
 *   details: Object,
 *   status?: 'pending'|'confirmed'|'failed',
 * }} entry
 */
export function recordTransaction(entry) {
    const entries = getStore();
    entries.unshift({
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: entry.type,
        txHash: entry.txHash || null,
        address: entry.address || '',
        details: entry.details || {},
        status: entry.status || 'pending',
        timestamp: Date.now(),
    });
    saveStore(entries);
}

/**
 * Get all transactions for a specific wallet address.
 * @param {string} address
 * @returns {Array}
 */
export function getTransactions(address) {
    if (!address) return [];
    const entries = getStore();
    return entries.filter(e => e.address.toLowerCase() === address.toLowerCase());
}

/**
 * Get all transactions (any address).
 * @returns {Array}
 */
export function getAllTransactions() {
    return getStore();
}

/**
 * Update a transaction's status by txHash.
 * @param {string} txHash
 * @param {'pending'|'confirmed'|'failed'} status
 */
export function updateTransactionStatus(txHash, status) {
    if (!txHash) return;
    const entries = getStore();
    const entry = entries.find(e => e.txHash === txHash);
    if (entry) {
        entry.status = status;
        saveStore(entries);
    }
}

/**
 * Clear all transaction history.
 */
export function clearTransactionHistory() {
    localStorage.removeItem(STORAGE_KEY);
}
