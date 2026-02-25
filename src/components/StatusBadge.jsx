import React from 'react';

/**
 * Status badge component for displaying states.
 *
 * @param {{
 *   status: 'active' | 'upcoming' | 'ended' | 'cancelled' | 'finalized' | 'paused' | 'claimable' | 'locked' | 'unlockable' | 'expired' | 'revoked' | 'vesting',
 *   size?: 'sm' | 'md',
 *   label?: string,
 *   pulse?: boolean
 * }} props
 */
const StatusBadge = ({ status, size = 'md', label, pulse = false }) => {
    const displayLabel = label || STATUS_LABELS[status] || status;

    return (
        <span className={`status-badge status-${status} ${size} ${pulse ? 'pulse' : ''}`}>
            <span className="status-badge-dot" />
            {displayLabel}
        </span>
    );
};

const STATUS_LABELS = {
    active: 'Active',
    upcoming: 'Upcoming',
    ended: 'Ended',
    cancelled: 'Cancelled',
    finalized: 'Finalized',
    paused: 'Paused',
    claimable: 'Claimable',
    locked: 'Locked',
    unlockable: 'Unlockable',
    expired: 'Expired',
    revoked: 'Revoked',
    vesting: 'Vesting',
};

export default StatusBadge;
