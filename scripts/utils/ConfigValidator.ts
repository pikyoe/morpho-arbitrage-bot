export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ConfigSchema {
    required: string[];
    optional: string[];
    addressFields: string[];
    urlFields: string[];
    numericFields: string[];
}

export class ConfigValidator {

    private static MAINNET_SCHEMA: ConfigSchema = {
        required: [
            'PRIVATE_KEY',
            'BASE_RPC_URL',
            'MORPHO_ADDRESS',
            'UNISWAP_FACTORY_ADDRESS',
            'UNISWAP_ROUTER_ADDRESS',
            'UNISWAP_QUOTER_ADDRESS',
            'AERODROME_ROUTER',
            'WETH_ADDRESS',
            'USDC_ADDRESS',
            'MORPHO_FLASHLOAN_V2_ADDRESS',
            'ARBITRAGE_ENGINE_V2_ADDRESS',
            'UNISWAP_ADAPTER_V2_ADDRESS'
        ],
        optional: [
            'AERODROME_FACTORY_ADDRESS',
            'AERODROME_ADAPTER_V2_ADDRESS',
            'SAMPLE_AUTHORIZED_ADDRESS',
            'AERO_ADDRESS',
            'CBBTC_ADDRESS',
            'CBETH_ADDRESS',
            'BASE_RPC_URL_1',
            'BASE_RPC_URL_2',
            'UNISWAP_SUBGRAPH_URL',
            'AERODROME_SUBGRAPH_URL',
            'SUBGRAPH_POOL_LIMIT'
        ],
        addressFields: [
            'MORPHO_ADDRESS',
            'UNISWAP_FACTORY_ADDRESS',
            'AERODROME_FACTORY_ADDRESS',
            'UNISWAP_ROUTER_ADDRESS',
            'UNISWAP_QUOTER_ADDRESS',
            'AERODROME_ROUTER',
            'WETH_ADDRESS',
            'USDC_ADDRESS',
            'MORPHO_FLASHLOAN_V2_ADDRESS',
            'ARBITRAGE_ENGINE_V2_ADDRESS',
            'UNISWAP_ADAPTER_V2_ADDRESS',
            'AERODROME_ADAPTER_V2_ADDRESS',
            'SAMPLE_AUTHORIZED_ADDRESS',
            'AERO_ADDRESS',
            'CBBTC_ADDRESS',
            'CBETH_ADDRESS'
        ],
        urlFields: [
            'BASE_RPC_URL',
            'BASE_SEPOLIA_RPC_URL',
            'BASE_RPC_URL_1',
            'BASE_RPC_URL_2'
        ],
        numericFields: []
    };

    static validateMainnetConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required fields
        for (const field of this.MAINNET_SCHEMA.required) {
            const value = process.env[field];
            if (!value || value.trim() === '') {
                errors.push(`Missing required environment variable: ${field}`);
            }
        }

        // Validate address fields
        for (const field of this.MAINNET_SCHEMA.addressFields) {
            const value = process.env[field];
            if (value && value.trim() !== '') {
                if (!this.isValidAddress(value)) {
                    errors.push(`Invalid address format for ${field}: ${value}`);
                }
            }
        }

        // Validate URL fields
        for (const field of this.MAINNET_SCHEMA.urlFields) {
            const value = process.env[field];
            if (value && value.trim() !== '') {
                if (!this.isValidUrl(value)) {
                    errors.push(`Invalid URL format for ${field}: ${value}`);
                }
            }
        }

        // Validate private key
        const privateKey = process.env.PRIVATE_KEY;
        if (privateKey) {
            if (!this.isValidPrivateKey(privateKey)) {
                errors.push('Invalid private key format');
            }
            // Warn if private key looks like a real key (security check)
            if (privateKey.length > 20 && !privateKey.includes('...')) {
                warnings.push('⚠️ SECURITY WARNING: Private key appears to be exposed. Ensure .env file is not committed to git.');
            }
        }

        // Check for reasonable gas price configuration
        // This would be used if we had gas price settings

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    static isValidAddress(address: string): boolean {
        // Basic Ethereum address validation
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    static isValidPrivateKey(privateKey: string): boolean {
        // Basic private key validation
        return /^0x[a-fA-F0-9]{64}$/.test(privateKey);
    }

    static isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static isWebsocketUrl(url: string): boolean {
        return url.startsWith('ws://') || url.startsWith('wss://');
    }

    static printValidationResult(result: ValidationResult): void {
        console.log('========================================');
        console.log('CONFIGURATION VALIDATION');
        console.log('========================================');

        if (result.isValid) {
            console.log('✅ Configuration is valid');
        } else {
            console.log('❌ Configuration has errors');
        }

        if (result.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS:');
            result.warnings.forEach(warning => console.log(`  - ${warning}`));
        }

        if (result.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            result.errors.forEach(error => console.log(`  - ${error}`));
        }

        console.log('========================================\n');
    }

    static validateOrThrow(): void {
        const result = this.validateMainnetConfig();
        this.printValidationResult(result);

        if (!result.isValid) {
            throw new Error('Configuration validation failed. Please fix the errors above.');
        }
    }
}