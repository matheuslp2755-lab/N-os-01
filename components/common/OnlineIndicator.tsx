
import React from 'react';

interface OnlineIndicatorProps {
    className?: string;
}

const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({ className = 'bottom-0 right-0' }) => {
    return (
        <span 
            className={`absolute block h-4 w-4 rounded-full bg-green-500 ring-2 ring-white dark:ring-black ${className}`}
        />
    );
};

export default OnlineIndicator;
