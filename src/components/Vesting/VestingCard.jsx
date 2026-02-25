// BitLaunch - Vesting Card
import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Clock } from 'lucide-react';
import { vestingService } from '../../services/VestingService';

const VestingCard = ({ address }) => {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (address) {
            setLoading(true);
            vestingService.getSchedulesForAddress(address)
                .then(data => setSchedules(data))
                .catch(() => setSchedules([]))
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [address]);

    if (loading) return <div>Loading vesting data...</div>;
    if (schedules.length === 0) return (
        <div className="text-center text-muted" style={{ padding: '3rem 1rem' }}>
            <Lock size={32} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>No vesting schedules found for this address.</p>
        </div>
    );

    return (
        <>
            {schedules.map((schedule) => {
                const claimable = vestingService.computeClaimable(schedule);
                const progress = vestingService.computeProgress(schedule);
                const totalAmount = parseFloat(schedule.totalAmount);
                const claimedAmount = parseFloat(schedule.claimedAmount);
                const remaining = totalAmount - claimedAmount;

                return (
                    <div key={schedule.id} className="card vesting-card" style={{ marginTop: '2rem' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Lock size={20} className="text-orange" />
                                {schedule.tokenSymbol || 'Token'} Vesting
                            </h3>
                            <span className={`badge ${schedule.revoked ? 'badge-danger' : 'badge-primary'}`}>
                                {schedule.revoked ? 'Revoked' : `${progress.toFixed(0)}% Vested`}
                            </span>
                        </div>

                        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                            <div className="stat-box" style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Remaining</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{remaining.toFixed(2)}</div>
                            </div>
                            <div className="stat-box" style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Claimed</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{claimedAmount.toFixed(2)}</div>
                            </div>
                            <div className="stat-box" style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
                                <div style={{ color: '#2ecc71', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Claimable</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2ecc71' }}>{claimable.toFixed(2)}</div>
                            </div>
                        </div>

                        <div className="action-area" style={{ textAlign: 'center' }}>
                            <button className="btn btn-primary" disabled={claimable <= 0}>
                                <Unlock size={18} />
                                Claim Tokens
                            </button>
                            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <Clock size={14} />
                                Duration: {vestingService.formatDuration(schedule.vestingDuration)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
};

export default VestingCard;
