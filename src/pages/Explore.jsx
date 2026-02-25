// BitLaunch - Explore Page (V3 - Competition UI)
// Enumerates all presales deployed by the PresaleFactory.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { presaleFactoryService } from '../services/PresaleFactoryService';
import { presaleService } from '../services/PresaleService';
import useScrollAnimation from '../hooks/useScrollAnimation';
import { Rocket, Search, Plus, Compass } from 'lucide-react';
import PresaleCard from '../components/Presale/PresaleCard';
import '../styles/explore.css';
import '../styles/presale.css';

const Explore = () => {
    const [presales, setPresales] = useState([]);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    useScrollAnimation();

    useEffect(() => {
        loadPresales();
    }, []);

    const loadPresales = async () => {
        setLoading(true);
        try {
            // Step 1: Get all presale deployments from factory
            const deployments = await presaleFactoryService.getAllPresaleDeployments();

            // Step 2: For each deployment, read on-chain presale info
            const presalePromises = deployments.map(async (deployment) => {
                try {
                    const info = await presaleService.getPresaleInfo(deployment.presaleAddress);
                    if (!info || Number(info.hardCap) === 0) return null;

                    // Try to fetch token metadata for display
                    let tokenName = '';
                    let tokenSymbol = '';
                    try {
                        const tokenInfo = await presaleService.fetchTokenInfo(deployment.tokenAddress);
                        tokenName = tokenInfo.name;
                        tokenSymbol = tokenInfo.symbol;
                    } catch {
                        // Token info is optional — use address as fallback
                    }

                    const status = presaleService.getPresaleStatus(info);

                    return {
                        ...info,
                        id: deployment.presaleAddress,
                        presaleAddress: deployment.presaleAddress,
                        tokenAddress: deployment.tokenAddress,
                        creatorAddress: deployment.creator,
                        tokenName,
                        tokenSymbol,
                        status,
                        index: deployment.index,
                    };
                } catch (err) {
                    console.warn(`Failed to load presale ${deployment.presaleAddress}:`, err.message);
                    return null;
                }
            });

            const results = await Promise.all(presalePromises);
            setPresales(results.filter(Boolean));
        } catch (error) {
            console.error('Load presales failed:', error);
            setPresales([]);
        } finally {
            setLoading(false);
        }
    };

    const filteredPresales = presales.filter(p => {
        const matchesFilter = filter === 'all' || p.status === filter;
        if (!searchQuery.trim()) return matchesFilter;
        const q = searchQuery.toLowerCase();
        const matchesSearch =
            (p.tokenAddress || '').toLowerCase().includes(q) ||
            (p.tokenName || '').toLowerCase().includes(q) ||
            (p.tokenSymbol || '').toLowerCase().includes(q) ||
            (p.presaleAddress || '').toLowerCase().includes(q);
        return matchesFilter && matchesSearch;
    });

    return (
        <div className="explore-page page-transition">
            {/* Page Hero */}
            <section className="page-hero">
                <div className="page-hero-orb orb-1" />
                <div className="page-hero-orb orb-2" />
                <div className="page-hero-grid" />
                <div className="page-hero-content">
                    <div className="explore-hero-row">
                        <div>
                            <div className="page-hero-icon purple">
                                <Compass size={28} />
                            </div>
                            <h1 className="page-hero-title">Explore Projects</h1>
                        </div>
                        <Link to="/presale/create" className="btn btn-primary">
                            <Plus size={18} />
                            <span>Create Presale</span>
                        </Link>
                    </div>
                </div>
            </section>

            <div className="explore-container">
                {/* Search & Filters */}
                <div className="explore-controls animate-on-scroll" data-animate="up">
                    <div className="search-container">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by name, symbol, or address..."
                            className="input-field search-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="explore-filters">
                        {['all', 'live', 'upcoming', 'ended', 'filled'].map(f => (
                            <button
                                key={f}
                                className={`filter-btn ${filter === f ? 'active' : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Presales Grid */}
                {loading ? (
                    <div className="explore-empty">
                        <p>Loading presales from chain...</p>
                    </div>
                ) : filteredPresales.length === 0 ? (
                    <div className="explore-empty">
                        <div className="explore-empty-icon">
                            <Rocket size={32} />
                        </div>
                        <h3>No Projects Found</h3>
                        <p>Try adjusting your search or filters.</p>
                        {presales.length === 0 && (
                            <Link to="/presale/create" className="btn btn-primary mt-lg">
                                <Plus size={18} />
                                <span>Create Presale</span>
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="presales-grid">
                        {filteredPresales.map(presale => (
                            <PresaleCard key={presale.presaleAddress} presale={presale} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Explore;
