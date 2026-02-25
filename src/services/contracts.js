// Deployed contract addresses
// Reads from environment variables (VITE_*), falls back to defaults for regtest

export const CONTRACTS = {
    presale: import.meta.env.VITE_CONTRACT_PRESALE || '',
    presaleFactory: import.meta.env.VITE_CONTRACT_PRESALE_FACTORY || '',
    vesting: import.meta.env.VITE_CONTRACT_VESTING || '',
    lock: import.meta.env.VITE_CONTRACT_LOCK || '',
    factory: import.meta.env.VITE_CONTRACT_FACTORY || '',
    airdrop: import.meta.env.VITE_CONTRACT_AIRDROP || '',
};

export const PLATFORM_WALLET = import.meta.env.VITE_PLATFORM_WALLET || '';

export const NETWORK = import.meta.env.VITE_NETWORK || 'regtest';
