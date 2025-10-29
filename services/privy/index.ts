import { PrivyClient } from "@privy-io/node";
import type { WalletService, ServiceResult } from '../index.js';

// Must export as default for auto-discovery
export default class PrivyWalletService implements WalletService {
  private privyClient?: PrivyClient;
  private isInitialized = false;
  private ethereumWalletAddress?: string;
  private solanaWalletAddress?: string;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Load credentials from environment variables
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    const ethereumWalletId = process.env.PRIVY_ETHEREUM_WALLET_ID;
    this.ethereumWalletAddress = process.env.PRIVY_ETHEREUM_WALLET_ADDRESS;
    this.solanaWalletAddress = process.env.PRIVY_SOLANA_WALLET_ADDRESS;

    // Validate required configuration
    if (!appId || !appSecret || !ethereumWalletId) {
      throw new Error('Missing required env vars: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_ETHEREUM_WALLET_ID');
    }

    if (!this.ethereumWalletAddress) {
      throw new Error('Missing PRIVY_ETHEREUM_WALLET_ADDRESS - required for signature verification');
    }

    try {
      // Initialize Privy SDK client
      this.privyClient = new PrivyClient({
        appId,
        appSecret,
      });
      this.isInitialized = true;

    } catch (error: any) {
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  async signMessageEthereum(message: string): Promise<ServiceResult> {
    if (!this.isInitialized || !this.privyClient) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    const walletId = process.env.PRIVY_ETHEREUM_WALLET_ID!;

    try {
      // Time ONLY the API call - exclude message prep and response parsing
      const apiStart = performance.now();
      const { signature } = await this.privyClient.wallets().ethereum().signMessage(
        walletId,
        {
          message,
        }
      );
      const apiEnd = performance.now();

      // Return signature and timing - runner will use these for benchmarking
      const serviceResult: ServiceResult = {
        signature,
        apiLatencyMs: apiEnd - apiStart,
        walletAddress: this.ethereumWalletAddress!, // Required for signature verification
      };

      return serviceResult;

    } catch (error: any) {
      throw new Error(`Ethereum signing failed: ${error.message}`);
    }
  }

  async signMessageSolana(message: string): Promise<ServiceResult> {
    if (!this.isInitialized || !this.privyClient) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    const walletId = process.env.PRIVY_SOLANA_WALLET_ID;

    if (!walletId) {
      throw new Error('Solana wallet not configured. Set PRIVY_SOLANA_WALLET_ID.');
    }

    if (!this.solanaWalletAddress) {
      throw new Error('Missing PRIVY_SOLANA_WALLET_ADDRESS - required for signature verification');
    }

    try {
      // Solana signing requires message as bytes (not timed)
      const messageBytes = new TextEncoder().encode(message);

      // Time ONLY the API call
      const apiStart = performance.now();
      const { signature } = await this.privyClient.wallets().solana().signMessage(
        walletId,
        {
          message: messageBytes,
        }
      );
      const apiEnd = performance.now();

      // Return signature as-is - @privy-io/node returns it in the correct format
      const serviceResult: ServiceResult = {
        signature,
        apiLatencyMs: apiEnd - apiStart,
        walletAddress: this.solanaWalletAddress!, // Required for signature verification
      };

      return serviceResult;

    } catch (error: any) {
      throw new Error(`Solana signing failed: ${error.message}`);
    }
  }
}
