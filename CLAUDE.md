# CLAUDE.md — BitLaunch

## Project Overview

BitLaunch is a no-code DeFi launchpad on Bitcoin Layer 1, built on the OP_NET protocol. It allows users to create tokens, run presales, set up vesting schedules, lock liquidity, and airdrop tokens — all without writing code.

## Architecture

- **Frontend**: React 19 + Vite 7, single-page app with React Router
- **Smart Contracts**: AssemblyScript compiled to WASM, deployed via OP_NET
- **Wallet**: OP_WALLET browser extension only (no MetaMask)
- **Provider**: `JSONRpcProvider` from `opnet` SDK for all chain reads

## Key Commands

```bash
# Frontend
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build → dist/

# Contracts
cd contracts
npm install          # Install contract dependencies
npm run build:all    # Build all contracts to WASM
node deploy.js       # Deploy token template
node deploy-contracts.js  # Deploy platform contracts
```

## Contract Structure

| Contract | Source | Output |
|----------|--------|--------|
| OP20 Token | `contracts/src/token/` | `build/OP20.wasm` |
| Factory | `contracts/src/factory/` | `build/Factory.wasm` |
| Presale | `contracts/src/presale/` | `build/Presale.wasm` |
| Vesting | `contracts/src/vesting/` | `build/Vesting.wasm` |
| Liquidity Lock | `contracts/src/lock/` | `build/LiquidityLock.wasm` |

## Environment

- `.env` — Contains contract addresses and network config (gitignored)
- `.env.example` — Template with empty values (committed)
- Network is set via `VITE_NETWORK` (regtest or mainnet)

## Important Rules

- Use SafeMath for ALL u256 arithmetic in contracts
- NEVER put private keys in frontend code
- Use separate `JSONRpcProvider` for reads (not wallet provider)
- All contract state uses unique storage pointers (no collisions)
- Simulate transactions before broadcasting
