#!/usr/bin/env node
/**
 * BitLaunch - Update .env from deployed.json
 *
 * Reads contract addresses from contracts/deployed.json and updates the
 * root .env file so the frontend picks up the latest addresses.
 *
 * Usage:
 *   node scripts/update-env.js
 *   node scripts/update-env.js --network regtest
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEPLOYED_PATH = path.join(ROOT, 'contracts', 'deployed.json');
const ENV_PATH = path.join(ROOT, '.env');

function main() {
    // Parse --network flag
    const args = process.argv.slice(2);
    let networkFilter = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--network' && args[i + 1]) {
            networkFilter = args[i + 1];
        }
    }

    // Read deployed.json
    if (!fs.existsSync(DEPLOYED_PATH)) {
        console.error('No contracts/deployed.json found.');
        console.error('Deploy contracts first: cd contracts && npm run deploy:contracts');
        process.exit(1);
    }

    const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, 'utf8'));

    // Extract addresses
    const addresses = {};

    // Token address from tokens array
    if (deployed.tokens && deployed.tokens.length > 0) {
        const token = deployed.tokens[deployed.tokens.length - 1]; // latest
        if (!networkFilter || token.network === networkFilter) {
            addresses.VITE_CONTRACT_TOKEN = token.contractAddress;
        }
    }

    // Contract addresses
    if (deployed.contracts) {
        const contractMap = {
            factory: 'VITE_CONTRACT_FACTORY',
            presale: 'VITE_CONTRACT_PRESALE',
            vesting: 'VITE_CONTRACT_VESTING',
            lock: 'VITE_CONTRACT_LOCK',
        };

        for (const [key, envVar] of Object.entries(contractMap)) {
            const contract = deployed.contracts[key];
            if (contract && (!networkFilter || contract.network === networkFilter)) {
                addresses[envVar] = contract.contractAddress;
            }
        }

        // Platform wallet from lock deployment
        if (deployed.contracts.lock?.platformWallet) {
            addresses.VITE_PLATFORM_WALLET = deployed.contracts.lock.platformWallet;
        }
    }

    if (Object.keys(addresses).length === 0) {
        console.log('No matching deployments found in deployed.json');
        process.exit(0);
    }

    // Read current .env (or start from example)
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
        envContent = fs.readFileSync(ENV_PATH, 'utf8');
    } else {
        const examplePath = path.join(ROOT, '.env.example');
        if (fs.existsSync(examplePath)) {
            envContent = fs.readFileSync(examplePath, 'utf8');
        }
    }

    // Update or append each address
    for (const [envVar, value] of Object.entries(addresses)) {
        const regex = new RegExp(`^${envVar}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${envVar}=${value}`);
        } else {
            envContent += `\n${envVar}=${value}`;
        }
    }

    // Set network if specified
    if (networkFilter) {
        const regex = /^VITE_NETWORK=.*$/m;
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `VITE_NETWORK=${networkFilter}`);
        }
    }

    fs.writeFileSync(ENV_PATH, envContent);

    console.log('Updated .env with deployed contract addresses:\n');
    for (const [envVar, value] of Object.entries(addresses)) {
        console.log(`  ${envVar}=${value}`);
    }
    console.log(`\nRestart the dev server to pick up changes.`);
}

main();
