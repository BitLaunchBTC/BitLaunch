// BitLaunch - Presale Card Component
// Displays a presale summary card with progress bar and status.
// Links to /presale/:address (the presale contract address).
import React from 'react';
import { Link } from 'react-router-dom';
import { presaleService } from '../../services/PresaleService';
import '../../styles/presale.css';

const PresaleCard = ({ presale }) => {
    const raised = Number(presale.totalRaised || 0);
    const hardCap = Number(presale.hardCap || 0);
    const softCap = Number(presale.softCap || 0);

    const progressPct = hardCap > 0 ? Math.min(100, (raised / hardCap) * 100) : 0;
    const softCapPct = hardCap > 0 ? (softCap / hardCap) * 100 : 0;

    const displayName = presale.tokenName && presale.tokenSymbol
        ? `${presale.tokenName} (${presale.tokenSymbol})`
        : presale.tokenSymbol || `Presale #${presale.index ?? '?'}`;

    const tokenLabel = (presale.tokenAddress || presale.token || '').slice(0, 12) + '...';

    return (
        <Link to={`/presale/${encodeURIComponent(presale.presaleAddress || presale.id)}`} style={{ textDecoration: 'none' }}>
            <div className="presale-card">
                <div className="presale-card-header">
                    <div className="presale-token-icon">
                        {presale.tokenSymbol ? presale.tokenSymbol.slice(0, 2).toUpperCase() : 'PS'}
                    </div>
                    <div className="presale-token-info">
                        <div className="presale-token-name">{displayName}</div>
                        <div className="presale-token-symbol">{tokenLabel}</div>
                    </div>
                    <div className={`presale-status ${presale.status}`}>
                        {presale.status}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="progress-container">
                    <div className="progress-labels">
                        <span className="progress-raised">{raised.toLocaleString()} sats</span>
                        <span className="progress-cap">{hardCap.toLocaleString()} sats</span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${progressPct}%` }}
                        />
                        {softCapPct > 0 && (
                            <div
                                className="soft-cap-marker"
                                style={{ left: `${softCapPct}%` }}
                                title={`Soft Cap: ${softCap.toLocaleString()} sats`}
                            />
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="presale-stats">
                    <div className="presale-stat">
                        <div className="presale-stat-value">
                            {raised.toLocaleString()}
                        </div>
                        <div className="presale-stat-label">Raised (sats)</div>
                    </div>
                    <div className="presale-stat">
                        <div className="presale-stat-value">
                            {presale.status === 'upcoming'
                                ? presaleService.formatTimeRemaining(presale.startTime)
                                : presaleService.formatTimeRemaining(presale.endTime)
                            }
                        </div>
                        <div className="presale-stat-label">
                            {presale.status === 'upcoming' ? 'Starts In' : 'Ends In'}
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default PresaleCard;
