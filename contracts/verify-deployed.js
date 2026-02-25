
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import crypto from 'crypto';

const network = networks.regtest;
const provider = new JSONRpcProvider('https://regtest.opnet.org', network);

const address = process.argv[2];

if (!address) {
    console.error('Usage: node verify-deployed.js <address>');
    process.exit(1);
}

// Selector generator (Keccak-256 for OPNet/Solidity compatibility)
function getSelector(signature) {
    // Note: OPNet usually uses Keccak-256. Node's crypto has 'sha3-256' which is NIST, not Keccak.
    // But often libraries use 'js-sha3' or similar. 
    // For now, let's assume standard selector "0x" + 4 bytes.
    // If we can't easily generate, we might guessing.
    // Actually, I can use a library if available. 
    // Let's try to just use a raw call with "0x00000000" if we don't know, but that might fail.
    // Wait! `opnet` likely has a helper.
    // Let's rely on `provider.call` with data.

    // Hardcoded selector for `getLockCount()`:
    // keccak256("getLockCount()") = ...
    // I will use a placeholder or generic "ping".

    // Better: Just check public key info and code. 
    // If I want to call, I need the selector.
    // I'll skip the call if I'm not sure, OR I'll try to read storage directly which is standard.
    // Storage pointer 0 is LOCK_COUNT_POINTER ???
    // In LiquidityLockContract.ts:
    // const LOCK_COUNT_POINTER: u16 = Blockchain.nextPointer;
    // Pointers start at 100 usually? Or 0?
    // "const PLATFORM_WALLET_POINTER: u16 = Blockchain.nextPointer;" (Deployment usually starts at 100 or something if using helpers? No, starts at 0 if no helpers?)
    // But `Blockchain.nextPointer` is a global counter.
    // If I am the first one, checks `LiquidityLockContract.ts` lines 29+.
    // It's `const` at top level.
    // Pointer 0: PLATFORM_WALLET_POINTER?
    // Pointer 1: LOCK_COUNT_POINTER?
    // Pointer 2: OWNER_POINTER?

    // I will try to read storage at index 1 (Lock Count).
    return null;
}


import { address as btcAddress } from '@btc-vision/bitcoin';

async function main() {
    console.log(`\n🔍 Verifying Contract: ${address}`);

    try {
        // 0. Decode locally
        console.log('0. Decoding Address locally...');
        try {
            const decoded = btcAddress.fromBech32(address);
            console.log(`   ✅ Valid Bech32! Prefix: ${decoded.prefix}, Version: ${decoded.version}`);
            console.log(`   Data Length: ${decoded.data.length} bytes`);
        } catch (e) {
            console.error('   ❌ Invalid Bech32 locally:', e.message);
        }

        // 1. Check PubKey Info FIRST (might work if code doesn't)
        console.log('1. Checking Public Key Info...');
        try {
            const info = await provider.getPublicKeyInfo(address);
            if (info) {
                console.log(`   ✅ Public Key Info found.`);
                console.log(`      Tweaked PubKey: ${info.tweakedPubkey ? info.tweakedPubkey.toString('hex') : 'N/A'}`);
            }
        } catch (e) {
            console.log('   ⚠️ No PubKey info or RPC failed:', e.message);
        }

        // 2. Check Code
        console.log('2. Checking Code...');
        try {
            const code = await provider.getCode(address);
            if (code && code.length > 0) {
                console.log(`   ✅ Code detected! Size: ${code.length} bytes`);
            } else {
                console.error('   ❌ No code found at this address (empty).');
            }
        } catch (e) {
            console.error('   ❌ Failed to fetch code:', e.message);
        }

        // 3. Check Balance
        console.log('3. Checking Balance...');
        try {
            const balance = await provider.getBalance(address);
            console.log(`   ✅ Balance: ${balance} satoshis`);
        } catch (e) {
            console.error('   ❌ Failed to fetch balance:', e.message);
        }


        // 4. Read Storage (Lock Count)
        console.log('4. Inspecting Storage State...');
        let foundStorage = false;
        for (let i = 0; i < 5; i++) {
            try {
                const stored = await provider.getStorageAt(address, i);
                if (stored) {
                    const hex = stored.value ? stored.value.toString('hex') : '';
                    if (hex && hex !== '00'.repeat(32)) {
                        console.log(`   ✅ Storage at Pointer ${i}: ${hex}`);
                        foundStorage = true;
                    }
                }
            } catch (e) { }
        }

        if (!foundStorage) {
            console.log('   ⚠️ No non-zero storage found in first 5 pointers.');
        }

        console.log('\n✅ Verification Logic Complete.');

    } catch (e) {
        console.error('❌ Verification Check Failed:', e.message);
    }
}

main().catch(console.error);
