import React from 'react';

/**
 * Global ambient background with floating gradient orbs and grid overlay.
 * CSS-only — no canvas, lightweight, GPU-composited.
 * Intensity varies by page (home = stronger, others = subtle).
 */
const AmbientBackground = ({ intensity = 'subtle' }) => {
    const isHome = intensity === 'strong';

    return (
        <div className="ambient-bg" aria-hidden="true">
            {/* Floating gradient orbs */}
            <div
                className="ambient-orb ambient-orb-1"
                style={{ opacity: isHome ? 0.6 : 0.3 }}
            />
            <div
                className="ambient-orb ambient-orb-2"
                style={{ opacity: isHome ? 0.5 : 0.25 }}
            />
            <div
                className="ambient-orb ambient-orb-3"
                style={{ opacity: isHome ? 0.4 : 0.2 }}
            />

            {/* Grid overlay */}
            <div
                className="ambient-grid"
                style={{ opacity: isHome ? 0.04 : 0.02 }}
            />
        </div>
    );
};

export default AmbientBackground;
