// BitLaunch - Error Boundary Component
import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <div className="error-content">
                        <div className="error-icon">
                            <AlertTriangle size={48} />
                        </div>
                        <h2>Something went wrong</h2>
                        <p>An unexpected error occurred. Please try again.</p>

                        {this.state.error && (
                            <div className="error-details">
                                <code>{this.state.error.message}</code>
                            </div>
                        )}

                        <div className="error-actions">
                            <button className="btn btn-primary" onClick={this.handleRetry}>
                                <RefreshCw size={18} />
                                Try Again
                            </button>
                            <button className="btn btn-secondary" onClick={this.handleGoHome}>
                                <Home size={18} />
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
