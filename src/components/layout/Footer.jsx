import React from 'react';
import { Link } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="app-footer">
            {/* Gradient top border */}
            <div className="footer-gradient-line" aria-hidden="true" />

            <div className="footer-inner">
                {/* Brand Column */}
                <div className="footer-brand">
                    <div className="footer-logo">
                        <div className="footer-logo-icon">
                            <Rocket size={20} />
                        </div>
                        <span className="footer-logo-text">BitLaunch</span>
                    </div>
                    <p className="footer-tagline">
                        No-code DeFi launchpad on Bitcoin Layer 1.
                        Create tokens, presales, vesting, and more.
                    </p>
                    <div className="footer-btc-badge">
                        <span className="btc-dot" />
                        Built on Bitcoin via OPNet
                    </div>
                </div>

                {/* Product Links */}
                <div className="footer-col">
                    <h4 className="footer-col-title">Product</h4>
                    <Link to="/launch" className="footer-nav-link">Launch Token</Link>
                    <Link to="/explore" className="footer-nav-link">Explore Presales</Link>
                    <Link to="/vesting" className="footer-nav-link">Vesting</Link>
                    <Link to="/lock" className="footer-nav-link">Liquidity Lock</Link>
                    <Link to="/airdrop" className="footer-nav-link">Airdrop Tool</Link>
                </div>

                {/* Resources */}
                <div className="footer-col">
                    <h4 className="footer-col-title">Resources</h4>
                    <a href="#" className="footer-nav-link">Documentation</a>
                    <a href="#" className="footer-nav-link">How It Works</a>
                    <a href="#" className="footer-nav-link">FAQ</a>
                    <a href="#" className="footer-nav-link">Support</a>
                </div>

                {/* Community */}
                <div className="footer-col">
                    <h4 className="footer-col-title">Community</h4>
                    <a href="#" className="footer-nav-link" target="_blank" rel="noopener noreferrer">
                        Twitter / X
                    </a>
                    <a href="#" className="footer-nav-link" target="_blank" rel="noopener noreferrer">
                        Discord
                    </a>
                    <a href="#" className="footer-nav-link" target="_blank" rel="noopener noreferrer">
                        Telegram
                    </a>
                    <a href="#" className="footer-nav-link" target="_blank" rel="noopener noreferrer">
                        GitHub
                    </a>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="footer-bottom">
                <span className="footer-copyright">
                    &copy; {new Date().getFullYear()} BitLaunch. All rights reserved.
                </span>
                <div className="footer-legal">
                    <a href="#" className="footer-legal-link">Privacy</a>
                    <a href="#" className="footer-legal-link">Terms</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
