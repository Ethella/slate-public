import type { WalletService, ServiceResult } from '../index.js';

// Magic Express API types based on documentation
interface MagicWalletResponse {
  public_address: string;
}

interface MagicSignResponse {
  signature: string;
  r: string;
  s: string;
  v: string;
}

// Must export as default for auto-discovery
export default class MagicWalletService implements WalletService {
  private isInitialized = false;
  private ethereumWalletAddress?: string;
  private solanaWalletAddress?: string;
  private jwtToken?: string;
  private apiKey?: string;
  private oidcProviderId?: string;

  private readonly MAGIC_BASE_URL = 'https://tee.express.magiclabs.com/v1';

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Load credentials from environment variables
    this.jwtToken = '';
    this.apiKey = ''
    this.oidcProviderId = '';

    // Validate required configuration
    if (!this.jwtToken || !this.apiKey || !this.oidcProviderId) {
      throw new Error('Missing required env vars: MAGIC_JWT_TOKEN, MAGIC_API_KEY, MAGIC_OIDC_PROVIDER_ID');
    }

    try {
      // Get or create Ethereum wallet to ensure it exists
      this.ethereumWalletAddress = await this.getOrCreateWallet('ETH');
      
      this.solanaWalletAddress = await this.getOrCreateWallet('SOL');
    
      this.isInitialized = true;

    } catch (error: any) {
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  private async getOrCreateWallet(chain: 'ETH' | 'SOL' | 'BTC'): Promise<string> {
    const response = await fetch(`${this.MAGIC_BASE_URL}/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.jwtToken}`,
        'X-Magic-Secret-Key': this.apiKey!,
        'X-OIDC-Provider-ID': this.oidcProviderId!,
        'X-Magic-Chain': chain,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get/create wallet for ${chain}: ${response.statusText}`);
    }

    const data: MagicWalletResponse = await response.json();
    return data.public_address;
  }

  async signMessageEthereum(message: string): Promise<ServiceResult> {
    if (!this.isInitialized) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    try {
      // Encode message as base64 (not timed)
      const messageBase64 = Buffer.from(message, 'utf8').toString('base64');

      // Time ONLY the API call
      const apiStart = performance.now();
      const response = await fetch(`${this.MAGIC_BASE_URL}/wallet/sign/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`,
          'X-Magic-Secret-Key': this.apiKey!,
          'X-OIDC-Provider-ID': this.oidcProviderId!,
          'X-Magic-Chain': 'ETH',
        },
        body: JSON.stringify({
          message_base64: messageBase64,
        }),
      });
      const apiEnd = performance.now();

      if (!response.ok) {
        throw new Error(`Magic API error: ${response.statusText}`);
      }

      const data: MagicSignResponse = await response.json();

      // Return signature and timing - runner will use these for benchmarking
      const serviceResult: ServiceResult = {
        signature: data.signature,
        apiLatencyMs: apiEnd - apiStart,
        walletAddress: this.ethereumWalletAddress!, // Required for signature verification
      };

      return serviceResult;

    } catch (error: any) {
      throw new Error(`Ethereum signing failed: ${error.message}`);
    }
  }

  async signMessageSolana(message: string): Promise<ServiceResult> {
    if (!this.isInitialized) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    if (!this.solanaWalletAddress) {
      throw new Error('Solana wallet not configured. Set MAGIC_SOLANA_WALLET_ADDRESS.');
    }

    try {
      // Encode message as base64 (not timed)
      const messageBase64 = Buffer.from(message, 'utf8').toString('base64');

      // Time ONLY the API call
      const apiStart = performance.now();
      const response = await fetch(`${this.MAGIC_BASE_URL}/wallet/sign/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`,
          'X-Magic-Secret-Key': this.apiKey!,
          'X-OIDC-Provider-ID': this.oidcProviderId!,
          'X-Magic-Chain': 'SOL',
        },
        body: JSON.stringify({
          message_base64: messageBase64,
        }),
      });
      const apiEnd = performance.now();

      if (!response.ok) {
        throw new Error(`Magic API error: ${response.statusText}`);
      }

      const data: MagicSignResponse = await response.json();

      // Return signature and timing - runner will use these for benchmarking
      const serviceResult: ServiceResult = {
        signature: data.signature,
        apiLatencyMs: apiEnd - apiStart,
        walletAddress: this.solanaWalletAddress!, // Required for signature verification
      };

      return serviceResult;

    } catch (error: any) {
      throw new Error(`Solana signing failed: ${error.message}`);
    }
  }
}
