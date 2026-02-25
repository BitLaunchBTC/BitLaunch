import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { OP20Factory } from './OP20Factory';

// Contract factory function
Blockchain.contract = () => {
    return new OP20Factory();
};

// Required exports
export * from '@btc-vision/btc-runtime/runtime/exports';

// Abort handler
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
