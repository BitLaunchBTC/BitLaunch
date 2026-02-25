
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { VestingContract } from './VestingContract';

// Entry point for the Vesting contract  
Blockchain.contract = () => {
    return new VestingContract();
};

// Required exports
export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
