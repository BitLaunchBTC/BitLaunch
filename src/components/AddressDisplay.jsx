import React, { useState, useCallback } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { formatAddress } from '../services/formatters';

/**
 * Address display component with copy and optional link.
 *
 * @param {{
 *   address: string,
 *   truncate?: boolean,
 *   copyable?: boolean,
 *   startChars?: number,
 *   endChars?: number,
 *   label?: string,
 *   mono?: boolean,
 *   explorerUrl?: string
 * }} props
 */
const AddressDisplay = ({
    address,
    truncate = true,
    copyable = true,
    startChars = 8,
    endChars = 6,
    label,
    mono = true,
    explorerUrl,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        if (!address) return;
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const el = document.createElement('textarea');
            el.value = address;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [address]);

    if (!address) return null;

    const displayText = truncate
        ? formatAddress(address, startChars, endChars)
        : address;

    return (
        <span className={`address-display ${mono ? 'font-mono' : ''}`}>
            {label && <span className="address-display-label">{label}: </span>}
            <span className="address-display-text" title={address}>
                {displayText}
            </span>
            {copyable && (
                <button
                    className="address-display-copy"
                    onClick={handleCopy}
                    title={copied ? 'Copied!' : 'Copy address'}
                    type="button"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
            )}
            {explorerUrl && (
                <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="address-display-link"
                    title="View in explorer"
                >
                    <ExternalLink size={14} />
                </a>
            )}
        </span>
    );
};

export default AddressDisplay;
