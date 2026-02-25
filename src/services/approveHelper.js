// BitLaunch - Token Approve + Wait Helper
// Shared utility for approve → wait-for-confirmation → proceed pattern.
// OPNet simulations run against confirmed on-chain state, so we must wait
// for the approve tx to be mined before simulating the next contract call.

/* global BigInt */

import { getContract, OP_20_ABI } from 'opnet';

/**
 * Read the current allowance for (owner → spender) on a token.
 * Returns BigInt (0n on any error).
 */
export async function checkAllowance(tokenAddr, owner, spender, provider, network) {
    try {
        const token = getContract(tokenAddr, OP_20_ABI, provider, network, owner);
        const result = await token.allowance(owner, spender);
        if (result.revert) return 0n;

        // Try multiple property names — the SDK may use any of these
        const props = result.properties || {};
        for (const key of ['allowance', 'value', 'amount', 'remaining']) {
            if (props[key] !== undefined && props[key] !== null) {
                return BigInt(props[key].toString());
            }
        }

        // Fallback: check result directly
        if (result.result !== undefined && result.result !== null) {
            try { return BigInt(result.result.toString()); } catch { /* ignore */ }
        }

        return 0n;
    } catch (e) {
        console.warn('checkAllowance failed:', e.message);
        return 0n;
    }
}

/**
 * Approve a spender to spend `amount` of the user's tokens,
 * then poll until the allowance is confirmed on-chain.
 *
 * Skips entirely if the current on-chain allowance is already sufficient.
 *
 * @param {Object} opts
 * @param {Address|string} opts.tokenAddr   - resolved token address
 * @param {Address}        opts.owner       - resolved owner address
 * @param {Address}        opts.spender     - resolved spender (contract) address
 * @param {BigInt}         opts.amount      - required allowance
 * @param {string}         opts.refundTo    - bech32 refund address
 * @param {Object}         opts.provider    - OPNet provider
 * @param {Object}         opts.network     - Bitcoin network
 * @param {function}       [opts.onProgress] - progress callback
 * @param {number}         [opts.maxWaitMs] - max wait (default 10 min)
 * @returns {boolean} true if approval was sent, false if skipped
 */
export async function approveAndWait({
    tokenAddr, owner, spender, amount,
    refundTo, provider, network,
    onProgress, maxWaitMs = 600000,
}) {
    // 1. Check existing allowance
    onProgress?.('Checking token allowance...');
    const currentAllowance = await checkAllowance(tokenAddr, owner, spender, provider, network);

    if (currentAllowance >= amount) {
        console.log('Sufficient allowance exists:', currentAllowance.toString());
        return false;
    }

    // 2. Simulate & send increaseAllowance (OPNet uses increaseAllowance, not approve)
    onProgress?.('Approving token transfer — please confirm in wallet...');
    const token = getContract(tokenAddr, OP_20_ABI, provider, network, owner);

    const delta = amount - currentAllowance;
    const approveSimulation = await token.increaseAllowance(spender, delta);
    if (approveSimulation.revert) {
        throw new Error(`Token approval failed: ${approveSimulation.revert}`);
    }

    await approveSimulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo,
        feeRate: 10,
        maximumAllowedSatToSpend: 50000n,
        network,
    });

    // 3. Poll until allowance appears on-chain
    onProgress?.('Waiting for approval to confirm on-chain...');
    const start = Date.now();
    let attempts = 0;

    while (Date.now() - start < maxWaitMs) {
        // Wait before first check (give the tx time to propagate)
        await new Promise(r => setTimeout(r, 5000));
        attempts++;

        const newAllowance = await checkAllowance(tokenAddr, owner, spender, provider, network);
        if (newAllowance >= amount) {
            console.log(`Allowance confirmed after ${attempts} poll(s):`, newAllowance.toString());
            return true;
        }

        const elapsed = Math.round((Date.now() - start) / 1000);
        onProgress?.(`Waiting for approval confirmation... (${elapsed}s)`);
    }

    throw new Error(
        'Token approval was sent but not confirmed in time. ' +
        'The transaction may still be pending — please wait a few minutes and try again.'
    );
}
