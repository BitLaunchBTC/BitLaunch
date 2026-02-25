// BitLaunch - Navbar Component
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { Rocket, Wallet, Menu, X, ChevronDown } from 'lucide-react';
import NetworkStatus from '../NetworkStatus';

const Navbar = () => {
    const { connected, address, connect, disconnect, network, formatAddress } = useWallet();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    const isActive = (path) => location.pathname === path;

    // Close mobile menu on route change
    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    // Scroll-aware navbar background
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 40);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
            <div className="nav-container">
                {/* Logo */}
                <Link to="/" className="nav-logo">
                    <div className="logo-icon">
                        <img src="/logo.svg" alt="BitLaunch Logo" width="40" height="40" />
                    </div>
                    <span className="logo-text">BitLaunch</span>
                </Link>

                {/* Desktop Nav */}
                <div className="nav-links">
                    <Link
                        to="/launch"
                        className={`nav-link ${isActive('/launch') ? 'active' : ''}`}
                    >
                        Launch
                    </Link>
                    <Link
                        to="/explore"
                        className={`nav-link ${isActive('/explore') ? 'active' : ''}`}
                    >
                        Explore
                    </Link>

                    <Link
                        to="/explore/tokens"
                        className={`nav-link ${isActive('/explore/tokens') ? 'active' : ''}`}
                    >
                        Tokens
                    </Link>

                    <Link
                        to="/presale/create"
                        className={`nav-link ${isActive('/presale/create') ? 'active' : ''}`}
                    >
                        Presale
                    </Link>

                    {/* Tools Dropdown */}
                    <div className="nav-dropdown">
                        <div className="dropdown-trigger">
                            Tools <ChevronDown size={14} />
                        </div>
                        <div className="dropdown-menu">
                            <Link to="/vesting" className={`dropdown-item ${isActive('/vesting') ? 'active' : ''}`}>
                                Vesting
                            </Link>
                            <Link to="/lock" className={`dropdown-item ${isActive('/lock') ? 'active' : ''}`}>
                                Liquidity Lock
                            </Link>
                            <Link to="/airdrop" className={`dropdown-item ${isActive('/airdrop') ? 'active' : ''}`}>
                                Airdrop Tool
                            </Link>
                        </div>
                    </div>

                    <Link
                        to="/dashboard"
                        className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                    >
                        Dashboard
                    </Link>
                </div>

                {/* Right Side: Network Status + Wallet */}
                <div className="nav-actions">
                    {/* Network Status */}
                    <NetworkStatus network={network} />

                    {/* Wallet Button */}
                    {connected ? (
                        <button className="btn btn-secondary wallet-btn" onClick={disconnect}>
                            <Wallet size={16} />
                            <span>{formatAddress(address)}</span>
                        </button>
                    ) : (
                        <button
                            onClick={connect}
                            className="wallet-btn wallet-btn-pulse"
                        >
                            <Wallet size={18} />
                            <span>Connect Wallet</span>
                        </button>
                    )}

                    {/* Mobile Menu Button */}
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    >
                        {menuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {menuOpen && (
                <div className="mobile-menu">
                    <Link
                        to="/launch"
                        className={`mobile-link ${isActive('/launch') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Launch Token
                    </Link>
                    <Link
                        to="/explore"
                        className={`mobile-link ${isActive('/explore') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Explore
                    </Link>
                    <Link
                        to="/explore/tokens"
                        className={`mobile-link ${isActive('/explore/tokens') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Tokens
                    </Link>
                    <Link
                        to="/presale/create"
                        className={`mobile-link ${isActive('/presale/create') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Presale
                    </Link>
                    <Link
                        to="/dashboard"
                        className={`mobile-link ${isActive('/dashboard') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Dashboard
                    </Link>
                    <div className="mobile-divider"></div>
                    <Link
                        to="/vesting"
                        className={`mobile-link ${isActive('/vesting') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Vesting
                    </Link>
                    <Link
                        to="/lock"
                        className={`mobile-link ${isActive('/lock') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Liquidity Lock
                    </Link>
                    <Link
                        to="/airdrop"
                        className={`mobile-link ${isActive('/airdrop') ? 'active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                    >
                        Airdrop Tool
                    </Link>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
