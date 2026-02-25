import React from 'react';
import '../styles/components.css'; // Ensure styles are loaded

const Skeleton = ({ width, height, borderRadius, style, className }) => {
    const skeletonStyle = {
        width: width || '100%',
        height: height || '20px',
        borderRadius: borderRadius || '4px',
        ...style
    };

    return (
        <div
            className={`skeleton-loader ${className || ''}`}
            style={skeletonStyle}
        />
    );
};

export default Skeleton;
