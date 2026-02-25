// Diagnostic script: Read factory-deployed token on-chain
// Usage: node read-token.js [tokenAddress]

import { getContract, OP_20_ABI, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const network = networks.regtest;
const provider = new JSONRpcProvider('https://regtest.opnet.org', network);

// Factory ABI (read methods)
const FACTORY_ABI = [
    ...OP_NET_ABI,
    {
        name: 'getDeploymentsCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getDeploymentByIndex',
        inputs: [{ name: 'index', type: ABIDataTypes.UINT32 }],
        outputs: [
            { name: 'deployer', type: ABIDataTypes.ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'block', type: ABIDataTypes.UINT64 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokenOwner',
        inputs: [{ name: 'tokenAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokenDeployer',
        inputs: [{ name: 'tokenAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'deployer', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'owner',
        inputs: [],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
];

// Template ABI = OP20 + template-specific methods
const TEMPLATE_ABI = [
    ...OP_20_ABI,
    {
        name: 'getTokenOwner',
        inputs: [],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFactoryAddress',
        inputs: [],
        outputs: [{ name: 'factory', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
];

const FACTORY_ADDRESS = 'opr1sqzlyrtf768qunqm2ua3adkqg9meqkyckjq0jndz2';

async function main() {
    const tokenAddr = process.argv[2];

    console.log('=== BitLaunch Contract Diagnostic ===\n');
    console.log('Factory:', FACTORY_ADDRESS);

    // 1. Query factory
    console.log('\n--- Factory State ---');
    let lastTokenAddress = tokenAddr;
    try {
        const factory = getContract(FACTORY_ADDRESS, FACTORY_ABI, provider, network);

        const countResult = await factory.getDeploymentsCount();
        const count = countResult.properties?.count ?? 0;
        console.log('Deployments count:', count, '| revert:', countResult.revert || 'none');

        const ownerResult = await factory.owner();
        const ownerAddr = ownerResult.properties?.owner;
        console.log('Factory owner:', ownerAddr ? ownerAddr.p2op(network) : 'null', '| revert:', ownerResult.revert || 'none');

        if (count > 0 && !tokenAddr) {
            const lastDeploy = await factory.getDeploymentByIndex(count - 1);
            const deployerAddr = lastDeploy.properties?.deployer;
            const tokenAddrObj = lastDeploy.properties?.token;
            console.log('\nLast deployment (index', count - 1, '):');
            console.log('  deployer:', deployerAddr ? deployerAddr.p2op(network) : 'null');
            console.log('  token:', tokenAddrObj ? tokenAddrObj.p2op(network) : 'null');
            console.log('  block:', lastDeploy.properties?.block?.toString());

            if (tokenAddrObj) {
                lastTokenAddress = tokenAddrObj.p2op(network);
            }
        }
    } catch (e) {
        console.log('Factory query error:', e.message);
    }

    // 2. Query the token directly
    if (lastTokenAddress) {
        console.log('\n--- Token State ---');
        console.log('Token address:', lastTokenAddress);

        try {
            const token = getContract(lastTokenAddress, TEMPLATE_ABI, provider, network);

            // Standard OP20 methods
            console.log('\nOP20 Standard:');

            const nameR = await token.name();
            console.log('  name():', nameR.properties?.name, '| revert:', nameR.revert || 'none');

            const symbolR = await token.symbol();
            console.log('  symbol():', symbolR.properties?.symbol, '| revert:', symbolR.revert || 'none');

            const decR = await token.decimals();
            console.log('  decimals():', decR.properties?.decimals, '| revert:', decR.revert || 'none');

            const tsR = await token.totalSupply();
            console.log('  totalSupply():', tsR.properties?.totalSupply?.toString(), '| revert:', tsR.revert || 'none');

            const msR = await token.maximumSupply();
            console.log('  maximumSupply():', msR.properties?.maximumSupply?.toString(), '| revert:', msR.revert || 'none');

            // The key methods for ownership
            console.log('\nOwnership / Template:');

            // deployer() - this is built into OP_NET base, returns Blockchain.contractDeployer
            // (our override should return tokenOwner instead)
            try {
                const depR = await token.deployer();
                const depAddr = depR.properties?.deployer;
                console.log('  deployer():', depAddr ? depAddr.p2op(network) : depAddr?.toString(), '| revert:', depR.revert || 'none');
            } catch (e) {
                console.log('  deployer(): ERROR -', e.message);
            }

            // getTokenOwner() - our custom method
            try {
                const toR = await token.getTokenOwner();
                const toAddr = toR.properties?.owner;
                console.log('  getTokenOwner():', toAddr ? toAddr.p2op(network) : toAddr?.toString(), '| revert:', toR.revert || 'none');
            } catch (e) {
                console.log('  getTokenOwner(): ERROR -', e.message);
            }

            // getFactoryAddress() - our custom method
            try {
                const faR = await token.getFactoryAddress();
                const faAddr = faR.properties?.factory;
                console.log('  getFactoryAddress():', faAddr ? faAddr.p2op(network) : faAddr?.toString(), '| revert:', faR.revert || 'none');
            } catch (e) {
                console.log('  getFactoryAddress(): ERROR -', e.message);
            }

        } catch (e) {
            console.log('Token query error:', e.message);
        }
    } else {
        console.log('\nNo token found. Pass address: node read-token.js <opr1...>');
    }

    console.log('\n=== Done ===');
    process.exit(0);
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
