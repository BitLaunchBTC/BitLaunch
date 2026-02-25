// BitLaunch - Main App Component
import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { WalletProvider } from './contexts/WalletContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import AmbientBackground from './components/AmbientBackground';

// Pages
import Home from './pages/Home';
import LaunchToken from './pages/LaunchToken';
import Explore from './pages/Explore';
import CreatePresale from './pages/CreatePresale';
import PresaleDetail from './pages/PresaleDetail';
import Dashboard from './pages/Dashboard';
import Vesting from './pages/Vesting';
import LiquidityLock from './pages/LiquidityLock';
import Airdrop from './pages/Airdrop';
import AirdropClaim from './pages/AirdropClaim';
import TokenDirectory from './pages/TokenDirectory';

// Import styles
import './styles/theme.css';
import './styles/components.css';
import './styles/mobile.css';

// Wrapper component to handle route transitions
const AnimatedRoutes = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <>
      <AmbientBackground intensity={isHome ? 'strong' : 'subtle'} />
      <div key={location.pathname} className="page-transition">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/launch" element={<LaunchToken />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/presale/create" element={<CreatePresale />} />
          <Route path="/presale/:id" element={<PresaleDetail />} />

          {/* Tools */}
          <Route path="/vesting" element={<Vesting />} />
          <Route path="/lock" element={<LiquidityLock />} />
          <Route path="/airdrop" element={<Airdrop />} />
          <Route path="/airdrop/:id" element={<AirdropClaim />} />
          <Route path="/explore/tokens" element={<TokenDirectory />} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={
            <div className="not-found-page">
              <div className="not-found-content">
                <div className="not-found-code">404</div>
                <h2>Page Not Found</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                  The page you're looking for doesn't exist or has been moved.
                </p>
                <Link to="/" className="btn btn-primary">Back to Home</Link>
              </div>
            </div>
          } />
        </Routes>
      </div>
    </>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <WalletConnectProvider theme="dark">
        <WalletProvider>
          <ToastProvider>
            <BrowserRouter>
              <div className="app">
                <div className="background-sparkles" />
                <Navbar />
                <main>
                  <AnimatedRoutes />
                </main>
                <Footer />
              </div>
            </BrowserRouter>
          </ToastProvider>
        </WalletProvider>
      </WalletConnectProvider>
    </ErrorBoundary>
  );
}

export default App;
