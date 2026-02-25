// BitLaunch - Loading Spinner Component
import React from 'react';

const LoadingSpinner = ({ size = 'md', text = '' }) => {
    const sizes = {
        sm: 24,
        md: 40,
        lg: 64,
        xl: 80
    };

    const spinnerSize = sizes[size] || sizes.md;

    return (
        <div className="loading-spinner-container">
            <div
                className="loading-spinner"
                style={{ width: spinnerSize, height: spinnerSize }}
            >
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-core"></div>
            </div>
            {text && <p className="loading-text">{text}</p>}
        </div>
    );
};

export default LoadingSpinner;
