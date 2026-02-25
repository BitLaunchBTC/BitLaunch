import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { OP20Template } from '../token/OP20Template';

// Entry point for the OP20 Template contract (used by factory)
Blockchain.contract = () => {
    return new OP20Template();
};

// Required exports
export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
