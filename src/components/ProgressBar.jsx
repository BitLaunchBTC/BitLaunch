import React from 'react';
import { formatPercentage } from '../services/formatters';

/**
 * Progress bar component with optional label and markers.
 *
 * @param {{
 *   value: number,
 *   max: number,
 *   label?: string,
 *   showPercentage?: boolean,
 *   size?: 'sm' | 'md' | 'lg',
 *   variant?: 'default' | 'success' | 'warning' | 'danger',
 *   markers?: Array<{ position: number, label: string }>,
 *   className?: string
 * }} props
 */
const ProgressBar = ({
    value,
    max,
    label,
    showPercentage = true,
    size = 'md',
    variant = 'default',
    markers,
    className = '',
}) => {
    const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

    // Auto-determine variant based on percentage if not explicitly set
    const effectiveVariant =
        variant === 'default'
            ? percentage >= 100
                ? 'success'
                : percentage >= 75
                    ? 'warning'
                    : 'default'
            : variant;

    return (
        <div className={`progress-bar-container ${size} ${className}`}>
            {(label || showPercentage) && (
                <div className="progress-bar-header">
                    {label && <span className="progress-bar-label">{label}</span>}
                    {showPercentage && (
                        <span className="progress-bar-percentage">
                            {formatPercentage(percentage)}
                        </span>
                    )}
                </div>
            )}
            <div className="progress-bar-track">
                <div
                    className={`progress-bar-fill ${effectiveVariant}`}
                    style={{ width: `${percentage}%` }}
                />
                {markers &&
                    markers.map((marker, i) => {
                        const markerPos = max > 0 ? (marker.position / max) * 100 : 0;
                        return (
                            <div
                                key={i}
                                className="progress-bar-marker"
                                style={{ left: `${markerPos}%` }}
                                title={marker.label}
                            >
                                <span className="progress-bar-marker-label">{marker.label}</span>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
};

export default ProgressBar;
