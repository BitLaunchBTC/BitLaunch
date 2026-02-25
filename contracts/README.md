# BitLaunch Contracts

OPNet smart contracts for the BitLaunch platform: token creation, presales, vesting, and liquidity locks.

## Contracts

| Contract | WASM | Purpose |
|----------|------|---------|
| **OP20Template** / **MyToken** | `build/OP20.wasm` | ERC20-style token with configurable name/symbol/supply |
| **OP20Factory** | `build/Factory.wasm` | Registry for deployed tokens |
| **PresaleContract** | `build/Presale.wasm` | Token presale with hard/soft caps, 2% platform fee |
| **VestingContract** | `build/Vesting.wasm` | Linear vesting with cliff periods |
| **LiquidityLockContract** | `build/LiquidityLock.wasm` | LP token locking with 0.5% platform fee |

## Prerequisites

- Node.js 18+
- Funded wallet (satoshis for deployment gas fees)
- OPNet RPC access (regtest/testnet/mainnet)

## Build

```bash
cd contracts
npm install

# Build all contracts
npm run build:all

# Build individually
npm run build:token
npm run build:factory
npm run build:presale
npm run build:vesting
npm run build:lock
```

## Deployment Order

Contracts must be deployed in this order:

### Step 1: Deploy Token (template for factory)

```bash
cd contracts
export MNEMONIC="your twelve word seed phrase"

node deploy.js --network regtest \
  --name "BitLaunch Token" \
  --symbol "BLT" \
  --decimals 18 \
  --supply 1000000000000000000000000000
```

Note the **contract address** from the output — you need it for factory deployment.

### Step 2: Deploy Platform Contracts

```bash
# Deploy all at once (factory needs --template from Step 1)
node deploy-contracts.js --network regtest \
  --template <token-address-from-step1>

# Or deploy individually:
node deploy-contracts.js --network regtest --contract factory --template <tokenAddr>
node deploy-contracts.js --network regtest --contract presale
node deploy-contracts.js --network regtest --contract vesting
node deploy-contracts.js --network regtest --contract lock
```

The deployer's wallet is automatically used as the platform fee wallet for the lock contract.

### Step 3: Update Frontend Config

```bash
# Auto-update .env from deployed.json
node scripts/update-env.js

# Or manually edit .env with the addresses from deployed.json
```

### Step 4: Verify

```bash
# Restart the frontend dev server
cd ..
npm run dev
```

Open the app and test each flow: create token, presale, vesting, and lock.

## Deployment Output

All deployment results are saved to `contracts/deployed.json`:

```json
{
  "tokens": [
    {
      "name": "BitLaunch Token",
      "symbol": "BLT",
      "contractAddress": "...",
      "txHash": "...",
      "network": "regtest"
    }
  ],
  "contracts": {
    "factory": { "contractAddress": "...", "txHash": "..." },
    "presale": { "contractAddress": "...", "txHash": "..." },
    "vesting": { "contractAddress": "...", "txHash": "..." },
    "lock":    { "contractAddress": "...", "txHash": "..." }
  }
}
```

## Contract Calldata (on deployment)

| Contract | Calldata | Notes |
|----------|----------|-------|
| Token | name, symbol, decimals, maxSupply, initialSupply | Configurable via CLI flags |
| Factory | templateAddress (Address) | Token address from Step 1 |
| Presale | none | Sets deployer as creator |
| Vesting | none | No initialization needed |
| Lock | platformWallet (Address) | Auto-set to deployer address |

## Files

```
contracts/
├── src/
│   ├── token/          # OP20 Token (MyToken + OP20Template)
│   ├── factory/        # OP20 Factory (token registry)
│   ├── presale/        # Presale Contract
│   ├── vesting/        # Vesting Contract
│   └── lock/           # Liquidity Lock Contract
├── build/              # Compiled WASM (after build)
├── abis/               # Auto-generated ABIs (after build)
├── asconfig.json       # AssemblyScript compiler config
├── package.json        # Dependencies and scripts
├── deploy.js           # Token deployment script
├── deploy-contracts.js # Platform contracts deployment
└── deployed.json       # Deployed addresses (after deploy)
```

## Mainnet Checklist

Before deploying to mainnet:

- [ ] All contracts tested on regtest with full E2E flow
- [ ] Presale: create, contribute, claim, finalize all work
- [ ] Vesting: create schedule, claim after cliff, revoke all work
- [ ] Lock: lock tokens, extend lock, unlock after expiry all work
- [ ] Factory: register token, query tokens all work
- [ ] Platform fee collection verified (2% presale, 0.5% lock)
- [ ] Remove mainnet safety check in deploy.js and deploy-contracts.js
- [ ] Set VITE_NETWORK=mainnet in .env
- [ ] Use a dedicated platform wallet (not deployer wallet) for fees
- [ ] Verify all contract addresses in .env match deployed addresses
- [ ] Frontend build succeeds with production config: `npm run build`
