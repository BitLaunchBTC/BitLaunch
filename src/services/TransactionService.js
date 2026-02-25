// BitLaunch - Transaction History Service
// Tracks all user transactions across the platform

class TransactionService {
    constructor() {
        this.STORAGE_KEY = 'bitlaunch_transactions';
    }

    /**
     * Record a transaction
     */
    recordTransaction({
        type, // 'contribution', 'claim', 'deploy', 'refund', 'transfer'
        userAddress,
        amount,
        tokenAmount = null,
        tokenSymbol = null,
        presaleId = null,
        contractAddress = null,
        txHash = null,
        status = 'completed',
        metadata = {}
    }) {
        const transaction = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            userAddress,
            amount,
            tokenAmount,
            tokenSymbol,
            presaleId,
            contractAddress,
            txHash,
            status, // pending, completed, failed
            metadata,
            timestamp: Date.now()
        };

        const transactions = this.getTransactions();
        transactions.unshift(transaction); // Add to beginning

        // Keep only last 500 transactions
        const trimmed = transactions.slice(0, 500);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));

        return transaction;
    }

    /**
     * Get all transactions
     */
    getTransactions() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    /**
     * Get user's transactions
     */
    getUserTransactions(userAddress, options = {}) {
        let transactions = this.getTransactions()
            .filter(tx => tx.userAddress === userAddress);

        // Filter by type
        if (options.type) {
            transactions = transactions.filter(tx => tx.type === options.type);
        }

        // Filter by presale
        if (options.presaleId) {
            transactions = transactions.filter(tx => tx.presaleId === options.presaleId);
        }

        // Filter by status
        if (options.status) {
            transactions = transactions.filter(tx => tx.status === options.status);
        }

        // Filter by date range
        if (options.startDate) {
            transactions = transactions.filter(tx => tx.timestamp >= options.startDate);
        }
        if (options.endDate) {
            transactions = transactions.filter(tx => tx.timestamp <= options.endDate);
        }

        // Limit results
        if (options.limit) {
            transactions = transactions.slice(0, options.limit);
        }

        return transactions;
    }

    /**
     * Get transaction by ID
     */
    getTransaction(id) {
        const transactions = this.getTransactions();
        return transactions.find(tx => tx.id === id);
    }

    /**
     * Update transaction status
     */
    updateTransactionStatus(id, status, txHash = null) {
        const transactions = this.getTransactions();
        const tx = transactions.find(t => t.id === id);

        if (tx) {
            tx.status = status;
            if (txHash) tx.txHash = txHash;
            tx.updatedAt = Date.now();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(transactions));
            return tx;
        }
        return null;
    }

    /**
     * Get transaction stats for user
     */
    getUserStats(userAddress) {
        const transactions = this.getUserTransactions(userAddress);

        const stats = {
            totalTransactions: transactions.length,
            contributions: 0,
            claims: 0,
            deploys: 0,
            totalContributed: 0,
            totalClaimed: 0
        };

        transactions.forEach(tx => {
            switch (tx.type) {
                case 'contribution':
                    stats.contributions++;
                    stats.totalContributed += tx.amount || 0;
                    break;
                case 'claim':
                    stats.claims++;
                    stats.totalClaimed += tx.tokenAmount || 0;
                    break;
                case 'deploy':
                    stats.deploys++;
                    break;
            }
        });

        return stats;
    }

    /**
     * Get recent activity for user
     */
    getRecentActivity(userAddress, limit = 10) {
        return this.getUserTransactions(userAddress, { limit });
    }

    /**
     * Format transaction for display
     */
    formatTransaction(tx) {
        const typeLabels = {
            contribution: 'Contributed to Presale',
            claim: 'Claimed Tokens',
            deploy: 'Deployed Token',
            refund: 'Received Refund',
            transfer: 'Token Transfer'
        };

        const typeIcons = {
            contribution: 'arrow-up-right',
            claim: 'download',
            deploy: 'rocket',
            refund: 'arrow-down-left',
            transfer: 'repeat'
        };

        return {
            ...tx,
            label: typeLabels[tx.type] || tx.type,
            icon: typeIcons[tx.type] || 'activity',
            formattedDate: this.formatDate(tx.timestamp),
            relativeTime: this.getRelativeTime(tx.timestamp)
        };
    }

    /**
     * Format date
     */
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Get relative time
     */
    getRelativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    /**
     * Clear user's transactions (for testing)
     */
    clearUserTransactions(userAddress) {
        const transactions = this.getTransactions();
        const filtered = transactions.filter(tx => tx.userAddress !== userAddress);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    }
}

export const transactionService = new TransactionService();
export default transactionService;
