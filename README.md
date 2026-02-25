# BitLaunch

**No-Code DeFi Launchpad on Bitcoin Layer 1 — powered by [OP_NET](https://opnet.org)**

> Deploy tokens, run presales, lock liquidity, vest team tokens, and airdrop to your community — all on Bitcoin, no coding required.

---

## What is BitLaunch?

BitLaunch is the first all-in-one token launchpad built natively on Bitcoin via the OP_NET smart contract protocol. It gives creators a complete suite of DeFi tools without writing a single line of code.

Whether you're launching a new token, raising funds through a fair presale, or proving trust by locking liquidity — BitLaunch handles the complexity so you can focus on building your project. Every action runs through smart contracts deployed directly on Bitcoin Layer 1, inheriting its security and decentralization.

---

## Features

| Feature | Description |
|---------|-------------|
| **Token Launch** | Create OP20 tokens in under 60 seconds. Customize name, symbol, supply, decimals, free mint, and burn settings. |
| **Fair Presale** | Run presales with hard/soft caps, whitelists, anti-bot protection, vesting, and automatic refunds. |
| **Vesting** | On-chain vesting schedules with configurable cliff, linear unlock, and TGE (immediate release %). |
| **Liquidity Lock** | Lock any OP20 token to prove rug-pull protection. Supports partial unlock and ownership transfer. |
| **Merkle Airdrop** | Gas-efficient claim-based airdrops using Merkle tree proofs. Creator can recover unclaimed tokens. |
| **Dashboard** | Unified view to manage all your tokens, presales, vesting schedules, locks, and airdrops. |
| **Token Directory** | Browse and search all tokens deployed through BitLaunch. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Bitcoin Layer 1 via [OP_NET](https://opnet.org) |
| **Smart Contracts** | AssemblyScript compiled to WebAssembly (WASM) |
| **Frontend** | React 19 + Vite 7 (SPA with React Router v7) |
| **Wallet** | OP_WALLET via `@btc-vision/walletconnect` |
| **Chain SDK** | `opnet` (JSONRpcProvider for reads, wallet for writes) |
| **Icons** | Lucide React |
| **Styling** | Custom CSS with dark theme, CSS variables, responsive design |

---

## Architecture

### High-Level Overview

```
+-------------------+       +-------------------+       +------------------+
|                   |       |                   |       |                  |
|   React Frontend  | <---> |   OPNet SDK       | <---> |  Bitcoin L1      |
|   (Vite 7 SPA)    |       |   (JSONRpcProvider)|      |  (OP_NET WASM)   |
|                   |       |                   |       |                  |
+-------------------+       +-------------------+       +------------------+
        |                           |                          |
   OP_WALLET               Simulate + Sign             8 Smart Contracts
   (Browser Ext)           (Read/Write Split)          (AssemblyScript)
```

### Frontend Architecture

```
src/
+-- App.jsx                          # Router + layout shell
+-- main.jsx                         # React 19 entry point
|
+-- pages/                           # 11 route pages
|   +-- Home.jsx                     # Landing page with on-chain stats
|   +-- LaunchToken.jsx              # Token creation wizard
|   +-- Explore.jsx                  # Browse all presales
|   +-- TokenDirectory.jsx           # Browse all tokens
|   +-- CreatePresale.jsx            # Multi-step presale setup
|   +-- PresaleDetail.jsx            # Contribute, claim, view presale
|   +-- Dashboard.jsx                # User's deployed assets
|   +-- Vesting.jsx                  # Create & manage vesting
|   +-- LiquidityLock.jsx            # Lock & unlock tokens
|   +-- Airdrop.jsx                  # Create Merkle airdrops
|   +-- AirdropClaim.jsx             # Claim with Merkle proof
|
+-- services/                        # Blockchain interaction layer
|   +-- FactoryService.js            # Deploy tokens via OP20Factory
|   +-- PresaleService.js            # Contribute, claim, finalize
|   +-- PresaleFactoryService.js     # Create presale instances
|   +-- VestingService.js            # Create & claim vesting
|   +-- LiquidityLockService.js      # Lock, unlock, partial withdraw
|   +-- AirdropService.js            # Create & claim airdrops
|   +-- TokenService.js              # Generic OP20 reads (balance, symbol)
|   +-- TransactionService.js        # Raw transaction utilities
|   +-- opnetProvider.js             # Singleton OPNet provider
|   +-- addressHelper.js             # Bech32 <-> 32-byte Address resolver
|   +-- merkleTree.js                # Build/verify Merkle trees
|   +-- approveHelper.js             # Token approval workflow
|   +-- contracts.js                 # Contract address registry
|   +-- formatters.js                # Number/amount formatting
|   +-- validation.js                # Input validation
|   +-- blockTime.js                 # Block <-> time conversion
|   +-- tokenRegistry.js             # Token metadata cache
|   +-- txHistory.js                 # Local transaction history
|   +-- abis/                        # Contract ABI definitions
|       +-- factoryAbi.js
|       +-- presaleAbi.js
|       +-- presaleFactoryAbi.js
|       +-- vestingAbi.js
|       +-- lockAbi.js
|       +-- airdropAbi.js
|
+-- components/                      # Reusable UI components
|   +-- layout/
|   |   +-- Navbar.jsx               # Top nav + wallet connect
|   |   +-- Footer.jsx               # Site footer
|   |   +-- AmbientBackground.jsx    # Particle background
|   +-- LoadingSpinner.jsx
|   +-- Skeleton.jsx                 # Loading placeholders
|   +-- ErrorBoundary.jsx
|   +-- Toast.jsx                    # Notification system
|   +-- NetworkStatus.jsx
|   +-- StatusBadge.jsx
|   +-- ProgressBar.jsx
|   +-- BlockCountdown.jsx           # Blocks -> human time
|   +-- TxTracker.jsx                # Tx status monitor
|   +-- AddressDisplay.jsx           # Copy-able address
|   +-- TokenAmount.jsx              # Formatted amounts
|   +-- TokenSelector.jsx            # Token dropdown
|   +-- StepWizard.jsx               # Multi-step forms
|   +-- EmptyState.jsx
|   +-- Presale/PresaleCard.jsx
|   +-- Vesting/VestingCard.jsx
|
+-- contexts/
|   +-- WalletContext.jsx            # Global wallet state
|
+-- hooks/
|   +-- useScrollAnimation.js        # Scroll-triggered animations
|   +-- useCountUp.js                # Animated counters
|
+-- styles/                          # CSS modules (18 files)
    +-- theme.css                    # Design system + CSS variables
    +-- components.css               # Global component styles
    +-- index.css                    # Base resets + typography
    +-- mobile.css                   # Responsive breakpoints
    +-- home.css, launch.css, explore.css, ...  # Per-page styles
```

### Smart Contract Architecture

```
contracts/
+-- src/
|   +-- token/
|   |   +-- MyToken.ts               # Standalone OP20 token
|   |   +-- OP20Template.ts          # Clone template for factory
|   |
|   +-- factory/
|   |   +-- OP20Factory.ts           # Token factory (registry pattern)
|   |
|   +-- presale/
|   |   +-- PresaleContract.ts       # Individual presale instance
|   |
|   +-- presale-factory/
|   |   +-- PresaleFactory.ts        # Presale deployer (clone pattern)
|   |
|   +-- vesting/
|   |   +-- VestingContract.ts       # Cliff + linear vesting
|   |
|   +-- lock/
|   |   +-- LiquidityLockContract.ts # Token locking with partial unlock
|   |
|   +-- airdrop/
|   |   +-- AirdropContract.ts       # Merkle tree claim-based airdrop
|
+-- abis/                            # Generated TypeScript ABI types
+-- build/                           # Compiled WASM + WAT output
+-- deploy.js                        # Token deployment script
+-- deploy-contracts.js              # Platform contracts deployment
+-- package.json
```

---

## Smart Contracts (8 Total)

### OP20Template
**Clone template for factory-deployed tokens.**
- OP20 standard compliance (transfer, approve, balanceOf)
- Free mint with per-user caps and total supply limits
- Toggleable burn support
- Pausable transfers (emergency stop)
- Ownership renouncement
- Two-step deployment: clone first, then initialize with 11 parameters

### OP20Factory
**Token deployment factory using clone pattern.**
- Deploys tokens via `Blockchain.deployContractFromExisting()` (clone, not full deploy)
- Multi-token per deployer (no overwrites)
- Global token registry with enumeration
- Per-deployer token tracking
- Reentrancy guard protection

### PresaleContract
**Individual presale instance with full lifecycle.**
- Hard cap and soft cap with automatic refunds
- Whitelist support (batch add/remove)
- Block-based timing (no vulnerable timestamps)
- Anti-bot protection (max contributors per block)
- Built-in vesting (cliff + linear, TGE unlock %)
- 2% configurable platform fee
- Contributor enumeration (full on-chain list)
- Lifecycle: Active -> Finalized -> Claimable / Refundable

### PresaleFactory
**Factory for deploying presale instances.**
- Two-step clone pattern (same as OP20Factory)
- Per-creator presale tracking
- Global presale registry with enumeration

### VestingContract
**Token vesting with cliff and linear release.**
- Block-based vesting periods
- Configurable cliff before linear unlock
- TGE (Token Generation Event) immediate unlock %
- Revocable schedules (creator can revoke)
- Per-beneficiary and per-creator indexed lookups
- Reentrancy protection

### LiquidityLockContract
**Lock any OP20 token for a specified duration.**
- Block-based unlock timing
- Partial unlock (withdraw portion after expiry)
- Lock ownership transfer
- Per-owner indexed lookups
- 0.5% configurable platform fee
- Reentrancy protection

### AirdropContract
**Gas-efficient Merkle tree claim-based airdrops.**
- Merkle proof verification (sorted-pair hashing, OpenZeppelin compatible)
- Per-airdrop expiry block
- Creator cancellation and recovery of unclaimed tokens
- Per-creator tracking
- Leaf format: `keccak256(claimer_32bytes || amount_32bytes_BE)`
- Reentrancy protection

### Platform Fee Summary

| Contract | Fee | Recipient |
|----------|-----|-----------|
| Presale | 2% of raised funds | Platform wallet |
| Liquidity Lock | 0.5% of locked amount | Platform wallet |
| Token Factory | None | - |
| Vesting | None | - |
| Airdrop | None | - |

---

## Key Design Patterns

### 1. Two-Step Clone Deployment
Used by OP20Factory and PresaleFactory to minimize deployment gas costs:
```
Step 1: Blockchain.deployContractFromExisting(templateAddr, salt, EMPTY_BYTES)
        -> Creates a clone of the template contract

Step 2: Blockchain.call(cloneAddr, initializeSelector, encodedParams)
        -> Initializes the clone with deployment parameters
```

### 2. Read/Write Split
- **Reads**: `JSONRpcProvider` from `opnet` SDK (no wallet needed)
- **Writes**: Simulate transaction -> Check for revert -> Sign via OP_WALLET -> Broadcast
- This separation allows the frontend to display data without wallet connection

### 3. Block-Based Timing
All V2 contracts use `Blockchain.block.number` instead of `medianTimestamp`:
- Eliminates timestamp manipulation vulnerabilities
- Bitcoin's 10-minute average block time provides predictable scheduling
- Frontend converts blocks to human-readable time via `blockTime.js`

### 4. Storage Pointer System
Each contract uses unique `u16` storage pointers to prevent collisions:
```typescript
const OWNER_POINTER: u16 = Blockchain.nextPointer;      // 7
const TOKEN_POINTER: u16 = Blockchain.nextPointer;       // 8
const HARD_CAP_POINTER: u16 = Blockchain.nextPointer;    // 9
// OP20 base uses pointers 0-6 automatically
```

### 5. Reentrancy Guard
Critical contracts use `ReentrancyGuard` from `btc-runtime`:
```typescript
this.onlyNonReentrant(ReentrancyLevel.NONREENTRANT);
// ... critical section ...
this.onlyNonReentrant(ReentrancyLevel.NONE);
```

### 6. Merkle Tree Airdrops
Off-chain tree building with on-chain proof verification:
1. Creator builds tree from `(recipient, amount)` pairs
2. Root stored on-chain, tokens transferred to contract
3. Recipients submit Merkle proof to claim
4. Contract verifies proof using sorted-pair hashing
5. Unclaimed tokens recoverable after expiry

### 7. Address Resolution
OPNet uses 32-byte addresses internally. Bech32 addresses (displayed to users) must be resolved:
```javascript
// NEVER use fromBech32() + pad - it's only 20 bytes (hash160)
// ALWAYS use provider.getPublicKeyInfo() for the full 32-byte address
const addr32 = await resolveAddress(bech32Address, isContract);
```

---

## Data Flow

### Token Launch Flow
```
User -> LaunchToken page
  -> FactoryService.deployToken(name, symbol, supply, decimals, ...)
    -> Simulate OP20Factory.deployToken()
    -> Check for revert
    -> Sign via OP_WALLET
    -> Factory clones OP20Template
    -> Factory calls initialize() on clone
    -> Token live on chain
  -> Token appears in Dashboard + TokenDirectory
```

### Presale Lifecycle
```
Creator -> CreatePresale page
  -> PresaleFactoryService.createPresale(token, hardCap, softCap, ...)
    -> Factory clones PresaleContract + initializes

Contributors -> PresaleDetail page
  -> PresaleService.contribute(presaleAddress, amount)
    -> Funds held in presale contract

Post-Presale:
  If hardCap reached or creator finalizes:
    -> PresaleService.finalize() -> distributes tokens + fees
    -> Contributors claim via PresaleService.claimTokens()
    -> If vesting enabled: tokens release over cliff + linear schedule

  If softCap not reached:
    -> Contributors get full refund via PresaleService.refund()
```

### Airdrop Flow
```
Creator -> Airdrop page
  -> Upload CSV or paste recipient list
  -> Frontend builds Merkle tree (merkleTree.js)
  -> AirdropService.createAirdrop(token, totalAmount, merkleRoot, expiryBlock)
    -> Contract stores root, receives tokens

Recipients -> AirdropClaim page
  -> Frontend generates Merkle proof for recipient
  -> AirdropService.claim(airdropId, amount, proof)
    -> Contract verifies proof, transfers tokens

After Expiry:
  -> Creator calls AirdropService.recoverExpired(airdropId)
    -> Unclaimed tokens returned to creator
```

---

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with animated hero, feature cards, on-chain stats |
| `/launch` | LaunchToken | Token creation wizard (name, symbol, supply, mint settings) |
| `/explore` | Explore | Browse and filter all deployed presales |
| `/explore/tokens` | TokenDirectory | Browse and search all deployed tokens |
| `/presale/create` | CreatePresale | Multi-step presale configuration wizard |
| `/presale/:id` | PresaleDetail | View presale metrics, contribute, claim |
| `/dashboard` | Dashboard | User's created tokens, presales, vesting, locks, airdrops |
| `/vesting` | Vesting | Create and manage vesting schedules |
| `/lock` | LiquidityLock | Lock tokens, view locks, partial unlock |
| `/airdrop` | Airdrop | Create Merkle-tree airdrops (CSV or manual) |
| `/airdrop/:id` | AirdropClaim | Claim airdrop with Merkle proof |

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **OP_WALLET** browser extension ([install](https://opnet.org))
- A funded Bitcoin wallet (regtest satoshis for testing)

### 1. Install Dependencies

```bash
# Frontend
npm install

# Contracts
cd contracts && npm install && cd ..
```

### 2. Build Contracts

```bash
cd contracts
npm run build:all
```

Individual contract builds:
```bash
npm run build:token           # OP20 token -> OP20.wasm
npm run build:template        # OP20Template -> OP20Template.wasm
npm run build:factory         # Factory -> Factory.wasm
npm run build:presale         # Presale -> Presale.wasm
npm run build:presale-factory # PresaleFactory -> PresaleFactory.wasm
npm run build:vesting         # Vesting -> Vesting.wasm
npm run build:lock            # Lock -> LiquidityLock.wasm
npm run build:airdrop         # Airdrop -> Airdrop.wasm
```

### 3. Deploy Contracts

```bash
cd contracts

# Deploy token template first
node deploy.js --network regtest

# Deploy all platform contracts
node deploy-contracts.js --network regtest --template <template-address>
```

**Deployment order**: Token -> Template -> Factory -> PresaleFactory -> Presale -> Vesting -> Lock -> Airdrop

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your deployed contract addresses:
```env
VITE_NETWORK=regtest
VITE_CONTRACT_FACTORY=<factory-address>
VITE_CONTRACT_PRESALE_FACTORY=<presale-factory-address>
VITE_CONTRACT_PRESALE=<presale-template-address>
VITE_CONTRACT_VESTING=<vesting-address>
VITE_CONTRACT_LOCK=<lock-address>
VITE_CONTRACT_AIRDROP=<airdrop-address>
VITE_PLATFORM_WALLET=<your-platform-wallet>
```

### 5. Run Frontend

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) with OP_WALLET installed.

### 6. Production Build

```bash
npm run build    # Output -> dist/
```

---

## Networks

| Network | RPC Endpoint | Status |
|---------|-------------|--------|
| Regtest | `https://regtest.opnet.org` | Development |
| Testnet | `https://testnet.opnet.org` | Testing |
| Mainnet | `https://mainnet.opnet.org` | Coming Soon |

Set `VITE_NETWORK` in `.env`. Default is `regtest`.

---

## Frontend Dependencies

| Package | Purpose |
|---------|---------|
| `react` + `react-dom` | UI framework (v19) |
| `react-router-dom` | Client-side routing (v7) |
| `opnet` | OPNet SDK for chain reads |
| `@btc-vision/transaction` | Bitcoin transaction building |
| `@btc-vision/walletconnect` | OP_WALLET connection |
| `@btc-vision/bitcoin` | Bitcoin protocol utilities |
| `lucide-react` | Icon library |
| `tsparticles` | Animated particle background |

## Contract Dependencies

| Package | Purpose |
|---------|---------|
| `@btc-vision/btc-runtime` | OPNet smart contract runtime |
| `@btc-vision/assemblyscript` | Modified AssemblyScript compiler |
| `@btc-vision/opnet-transform` | ABI generation transform plugin |
| `@btc-vision/as-bignum` | u256 BigNumber for contracts |

---

## Security

- All arithmetic uses **SafeMath** (u256) to prevent overflow/underflow
- **Reentrancy guards** on all state-changing contract methods
- **Block-based timing** eliminates timestamp manipulation
- **Simulate-before-send** pattern prevents failed transactions
- **No private keys** in frontend code — wallet handles all signing
- **Merkle proofs** for gas-efficient, verifiable airdrops
- **Storage pointer isolation** prevents state collisions between contracts

---

## Built With on Bitcoin

BitLaunch is a [#opnetvibecoding](https://opnet.org) project — built on the OP_NET protocol.

**Category**: DeFi
**Tags**: `Launchpad` `Token Creator` `Presale` `Vesting` `Liquidity Lock` `Airdrop` `No-Code`

---

## License

MIT
