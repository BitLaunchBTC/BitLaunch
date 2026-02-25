// BitLaunch - Home Page (Competition-Grade Redesign)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Coins, Lock, Users, Shield, Zap, ArrowRight, Wallet, Settings, Send, Clock, TrendingUp, CheckCircle } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { factoryService } from '../services/FactoryService';
import { vestingService } from '../services/VestingService';
import { presaleFactoryService } from '../services/PresaleFactoryService';
import useScrollAnimation from '../hooks/useScrollAnimation';
import useCountUp from '../hooks/useCountUp';
import '../styles/home.css';

const StatCounter = ({ end, label, icon, loading }) => {
    const { value, ref } = useCountUp(end, 1800);
    return (
        <div className="ribbon-stat" ref={ref}>
            <div className="ribbon-stat-icon">{icon}</div>
            <div className="ribbon-stat-value">{loading ? '-' : value}</div>
            <div className="ribbon-stat-label">{label}</div>
        </div>
    );
};

const Home = () => {
    const { connect, connected } = useWallet();
    useScrollAnimation();

    const [stats, setStats] = useState({ tokens: 0, presales: 0, vestingSchedules: 0 });
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetchStats() {
            try {
                const [tokenCount, scheduleCount, presaleCount] = await Promise.all([
                    factoryService.getDeployedTokensCount(),
                    vestingService.getScheduleCountOnChain(),
                    presaleFactoryService.getPresaleCount(),
                ]);

                if (!cancelled) {
                    setStats({
                        tokens: tokenCount,
                        presales: presaleCount,
                        vestingSchedules: scheduleCount,
                    });
                }
            } catch (err) {
                console.warn('Failed to fetch on-chain stats:', err.message);
            } finally {
                if (!cancelled) setLoadingStats(false);
            }
        }
        fetchStats();
        return () => { cancelled = true; };
    }, []);

    const handleMouseMove = (e) => {
        const cards = document.getElementsByClassName('feature-card');
        for (const card of cards) {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        }
    };

    const features = [
        {
            icon: <Coins size={26} />,
            title: 'Create OP20 Tokens',
            desc: 'Deploy custom tokens on OPNet with just a few clicks. No coding required.',
            link: '/launch',
            color: 'orange'
        },
        {
            icon: <Rocket size={26} />,
            title: 'Fair Launch',
            desc: 'Run transparent presales with whitelist, caps, and automatic refunds.',
            link: '/presale/create',
            color: 'purple'
        },
        {
            icon: <Lock size={26} />,
            title: 'Vesting Schedules',
            desc: 'Lock team tokens with customizable cliff and linear unlock periods.',
            link: '/vesting',
            color: 'green'
        },
        {
            icon: <Shield size={26} />,
            title: 'Liquidity Lock',
            desc: 'Lock LP tokens on MotoSwap to build community trust.',
            link: '/lock',
            color: 'blue'
        },
        {
            icon: <Users size={26} />,
            title: 'Merkle Airdrops',
            desc: 'Distribute tokens with gas-efficient Merkle proof claims.',
            link: '/airdrop',
            color: 'purple'
        },
        {
            icon: <Zap size={26} />,
            title: 'Bitcoin Native',
            desc: 'Powered by Bitcoin L1 security through OPNet smart contracts.',
            link: '/explore',
            color: 'orange'
        }
    ];

    const steps = [
        {
            number: '01',
            icon: <Wallet size={24} />,
            title: 'Connect Wallet',
            desc: 'Connect your OP_WALLET to get started in seconds.'
        },
        {
            number: '02',
            icon: <Settings size={24} />,
            title: 'Configure Token',
            desc: 'Set name, supply, and features like free mint and burn.'
        },
        {
            number: '03',
            icon: <Send size={24} />,
            title: 'Deploy on Bitcoin',
            desc: 'One click to deploy. Your token lives on Bitcoin L1.'
        }
    ];

    return (
        <div className="home" onMouseMove={handleMouseMove}>
            {/* ── HERO ── */}
            <section className="hero">
                <div className="hero-bg">
                    <div className="hero-grid"></div>
                    <div className="hero-orb hero-orb-1" />
                    <div className="hero-orb hero-orb-2" />
                    <div className="hero-orb hero-orb-3" />
                </div>

                <div className="hero-content">
                    <div className="hero-badge animate-on-scroll" data-animate="scale">
                        <Rocket size={14} />
                        <span>OPNet Launchpad</span>
                    </div>

                    <h1 className="hero-title animate-on-scroll">
                        Launch Your Token
                        <br />
                        on <span className="hero-highlight">Bitcoin</span>
                    </h1>

                    <p className="hero-subtitle animate-on-scroll stagger-2">
                        The premier no-code launchpad for OPNet tokens.
                        Create, launch, and grow your project with our
                        comprehensive suite of DeFi tools.
                    </p>

                    <div className="hero-actions animate-on-scroll stagger-3">
                        {connected ? (
                            <Link to="/launch" className="btn btn-primary btn-hero">
                                <Rocket size={20} />
                                <span>Launch Token</span>
                            </Link>
                        ) : (
                            <button className="btn btn-primary btn-hero" onClick={connect}>
                                <Rocket size={20} />
                                <span>Get Started</span>
                            </button>
                        )}
                        <Link to="/explore" className="btn btn-secondary btn-hero">
                            <span>Explore Projects</span>
                            <ArrowRight size={18} />
                        </Link>
                    </div>

                    {/* 3D Floating card mockup */}
                    <div className="hero-mockup animate-on-scroll stagger-4" aria-hidden="true">
                        <div className="mockup-card mockup-card-back">
                            <div className="mockup-line" />
                            <div className="mockup-line short" />
                        </div>
                        <div className="mockup-card mockup-card-front">
                            <div className="mockup-header">
                                <div className="mockup-token-icon" />
                                <div>
                                    <div className="mockup-line short" />
                                    <div className="mockup-line tiny" />
                                </div>
                            </div>
                            <div className="mockup-bar-track">
                                <div className="mockup-bar-fill" />
                            </div>
                            <div className="mockup-stats-row">
                                <div className="mockup-stat-block" />
                                <div className="mockup-stat-block" />
                                <div className="mockup-stat-block" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── STATS RIBBON ── */}
            <section className="stats-ribbon animate-on-scroll">
                <div className="stats-ribbon-inner">
                    <StatCounter
                        end={stats.tokens}
                        label="Tokens Deployed"
                        icon={<Coins size={18} />}
                        loading={loadingStats}
                    />
                    <div className="ribbon-divider" />
                    <StatCounter
                        end={stats.presales}
                        label="Presales Created"
                        icon={<Rocket size={18} />}
                        loading={loadingStats}
                    />
                    <div className="ribbon-divider" />
                    <StatCounter
                        end={stats.vestingSchedules}
                        label="Vesting Schedules"
                        icon={<Clock size={18} />}
                        loading={loadingStats}
                    />
                    <div className="ribbon-divider" />
                    <div className="ribbon-stat">
                        <div className="ribbon-stat-icon"><TrendingUp size={18} /></div>
                        <div className="ribbon-stat-value ribbon-stat-live">Live</div>
                        <div className="ribbon-stat-label">Network Status</div>
                    </div>
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section className="features">
                <div className="section-header animate-on-scroll">
                    <h2 className="section-title">Everything You Need</h2>
                    <p className="section-subtitle">
                        Complete toolkit for launching and managing your token project on Bitcoin
                    </p>
                </div>

                <div className="features-grid stagger-children">
                    {features.map((feature, index) => (
                        <Link
                            to={feature.link}
                            key={index}
                            className="feature-card-link animate-on-scroll"
                        >
                            <div className={`feature-card feature-card--${feature.color}`}>
                                <div className="feature-card-glow" />
                                <div className={`feature-icon feature-icon--${feature.color}`}>
                                    {feature.icon}
                                </div>
                                <h3 className="feature-title">{feature.title}</h3>
                                <p className="feature-desc">{feature.desc}</p>
                                <span className="feature-arrow">
                                    <ArrowRight size={16} />
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className="how-it-works">
                <div className="section-header animate-on-scroll">
                    <h2 className="section-title">How It Works</h2>
                    <p className="section-subtitle">
                        Go from idea to deployed token in three simple steps
                    </p>
                </div>

                <div className="steps-timeline stagger-children">
                    {steps.map((step, index) => (
                        <div key={index} className="step-card animate-on-scroll">
                            <div className="step-number-badge">{step.number}</div>
                            <div className="step-icon-circle">{step.icon}</div>
                            <h3 className="step-title">{step.title}</h3>
                            <p className="step-desc">{step.desc}</p>
                            {index < steps.length - 1 && (
                                <div className="step-connector" aria-hidden="true" />
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* ── BUILT FOR BITCOIN ── */}
            <section className="btc-section">
                <div className="btc-section-inner animate-on-scroll">
                    <div className="btc-badge-large">
                        <Shield size={20} />
                        Bitcoin Native
                    </div>
                    <h2 className="btc-title">Built on the Most Secure Blockchain</h2>
                    <p className="btc-desc">
                        BitLaunch runs on OPNet — smart contracts directly on Bitcoin Layer 1.
                        No bridges, no sidechains, no compromises.
                    </p>
                    <div className="btc-features stagger-children">
                        <div className="btc-feature animate-on-scroll">
                            <CheckCircle size={18} className="btc-check" />
                            <span>Bitcoin L1 Security</span>
                        </div>
                        <div className="btc-feature animate-on-scroll">
                            <CheckCircle size={18} className="btc-check" />
                            <span>Permissionless Deployment</span>
                        </div>
                        <div className="btc-feature animate-on-scroll">
                            <CheckCircle size={18} className="btc-check" />
                            <span>No Coding Required</span>
                        </div>
                        <div className="btc-feature animate-on-scroll">
                            <CheckCircle size={18} className="btc-check" />
                            <span>Open Source Contracts</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="cta-section animate-on-scroll">
                <div className="cta-card">
                    <div className="cta-glow" aria-hidden="true" />
                    <h2 className="cta-title">Ready to Build?</h2>
                    <p className="cta-desc">
                        Join the next generation of Bitcoin-native tokens.
                        Deploy your project in minutes.
                    </p>
                    {connected ? (
                        <Link to="/launch" className="btn btn-primary btn-hero">
                            <Rocket size={20} />
                            <span>Start Building</span>
                        </Link>
                    ) : (
                        <button className="btn btn-primary btn-hero" onClick={connect}>
                            <Wallet size={18} />
                            <span>Connect Wallet to Start</span>
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Home;
