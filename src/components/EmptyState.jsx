import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * Empty state placeholder component.
 *
 * @param {{
 *   icon?: React.ElementType,
 *   title: string,
 *   description?: string,
 *   action?: React.ReactNode,
 *   size?: 'sm' | 'md' | 'lg'
 * }} props
 */
const EmptyState = ({
    icon: Icon = Inbox,
    title,
    description,
    action,
    size = 'md',
}) => {
    const iconSize = size === 'sm' ? 28 : size === 'lg' ? 48 : 36;

    return (
        <div className={`empty-state ${size}`}>
            <div className="empty-state-icon">
                <Icon size={iconSize} />
            </div>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
            {action && <div className="empty-state-action">{action}</div>}
        </div>
    );
};

export default EmptyState;
