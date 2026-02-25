import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, Coins } from 'lucide-react';
import { opnetProvider } from '../services/opnetProvider';
import { tokenRegistry } from '../services/tokenRegistry';
import { formatAddress, formatTokenAmount } from '../services/formatters';

/**
 * Token selector dropdown with search and balance display.
 *
 * @param {{
 *   onSelect: (token: { address: string, name: string, symbol: string, decimals: number }) => void,
 *   selectedToken?: { address: string, symbol: string },
 *   walletAddress?: string,
 *   placeholder?: string,
 *   disabled?: boolean
 * }} props
 */
const TokenSelector = ({
    onSelect,
    selectedToken,
    walletAddress,
    placeholder = 'Select a token',
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadTokens = useCallback(async () => {
        setLoading(true);
        try {
            const registeredTokens = tokenRegistry.getAllTokens();
            setTokens(registeredTokens || []);
        } catch (err) {
            console.error('Failed to load tokens:', err);
            setTokens([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadTokens();
        }
    }, [isOpen, loadTokens]);

    const filteredTokens = tokens.filter((token) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (token.name && token.name.toLowerCase().includes(q)) ||
            (token.symbol && token.symbol.toLowerCase().includes(q)) ||
            (token.address && token.address.toLowerCase().includes(q))
        );
    });

    const handleSelect = (token) => {
        onSelect(token);
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div className={`token-selector ${disabled ? 'disabled' : ''}`}>
            <button
                type="button"
                className="token-selector-trigger"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                {selectedToken ? (
                    <span className="token-selector-selected">
                        <Coins size={16} />
                        <span>{selectedToken.symbol || formatAddress(selectedToken.address)}</span>
                    </span>
                ) : (
                    <span className="token-selector-placeholder">{placeholder}</span>
                )}
                <ChevronDown size={16} className={`token-selector-chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="token-selector-dropdown">
                    <div className="token-selector-search">
                        <Search size={14} />
                        <input
                            type="text"
                            placeholder="Search by name, symbol, or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="token-selector-list">
                        {loading ? (
                            <div className="token-selector-empty">Loading tokens...</div>
                        ) : filteredTokens.length === 0 ? (
                            <div className="token-selector-empty">
                                {searchQuery ? 'No tokens found' : 'No tokens available'}
                            </div>
                        ) : (
                            filteredTokens.map((token) => (
                                <button
                                    key={token.address}
                                    type="button"
                                    className={`token-selector-item ${selectedToken?.address === token.address ? 'selected' : ''}`}
                                    onClick={() => handleSelect(token)}
                                >
                                    <div className="token-selector-item-info">
                                        <span className="token-selector-item-symbol">
                                            {token.symbol || '???'}
                                        </span>
                                        <span className="token-selector-item-name">
                                            {token.name || formatAddress(token.address)}
                                        </span>
                                    </div>
                                    <span className="token-selector-item-address font-mono">
                                        {formatAddress(token.address, 6, 4)}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Click-away overlay */}
            {isOpen && (
                <div
                    className="token-selector-backdrop"
                    onClick={() => {
                        setIsOpen(false);
                        setSearchQuery('');
                    }}
                />
            )}
        </div>
    );
};

export default TokenSelector;
