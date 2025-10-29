/**
 * Core Wallet Service Interface
 *
 * This is the interface you need to implement to add your wallet service to the benchmark.
 *
 * Key principles:
 * - Your service only handles wallet operations - no timing or statistics
 * - The benchmarking framework handles all timing and metrics
 * - You control what gets timed by wrapping only your API call with performance.now()
 *
 * See the architecture doc for a complete implementation example.
 */

/**
 * Wallet service interface
 *
 * Implement this interface in your service's index.ts file to add your wallet
 * provider to the benchmark tool.
 *
 * Your service name will be automatically derived from your folder name.
 */
export interface WalletService {
  /**
   * Initialize your wallet service
   *
   * Called once before benchmarking begins. NOT timed.
   *
   * Use this to:
   * - Set up your SDK client
   * - Authenticate with your API
   * - Load wallet addresses from environment variables
   * - Perform any other one-time setup
   *
   * @throws Error if initialization fails (service will be skipped)
   */
  initialize(): Promise<void>;

  /**
   * Sign an Ethereum message
   *
   * The benchmark runner will pass STANDARD_ETHEREUM_MESSAGE to this function.
   * You simply receive the message as a parameter and sign it.
   *
   * Use `performance.now()` to measure the latency of **only** the signing API call.
   * Place `performance.now()` immediately before and after your service's signing method
   * to capture just the network request/response time. Do not time message preparation,
   * encoding, or signature formatting.
   *
   * Must return a `ServiceResult` object containing:
   * - `signature`: The signature string from your API
   * - `apiLatencyMs`: The measured time in milliseconds
   * - `walletAddress`: The wallet address that signed the message
   *
   * ```typescript
   * async signMessageEthereum(message: string): Promise<ServiceResult> {
   *   // Message prep/encoding (not timed)
   *   const encoded = yourAPI.needsBytes ? toBytes(message) : message;
   *
   *   // Time ONLY the API call
   *   const apiStart = performance.now();
   *   const sig = await yourClient.signEthereum(encoded);
   *   const apiEnd = performance.now();
   *
   *   // Response parsing (not timed)
   *   const signature = formatSig(sig);
   *
   *   return {
   *     signature,
   *     apiLatencyMs: apiEnd - apiStart,
   *     walletAddress: this.ethereumWalletAddress
   *   };
   * }
   * ```
   *
   * @param message - The test message to sign (passed by benchmark runner)
   * @returns ServiceResult with signature, API latency in milliseconds, and wallet address
   */
  signMessageEthereum?(message: string): Promise<ServiceResult>;

  /**
   * Sign a Solana message (optional)
   *
   * If your service supports Solana, implement this method.
   *
   * Use `performance.now()` to measure the latency of **only** the signing API call.
   * Place `performance.now()` immediately before and after your service's signing method
   * to capture just the network request/response time. Do not time message preparation,
   * encoding, or signature formatting.
   *
   * Must return a `ServiceResult` object containing:
   * - `signature`: The signature string from your API
   * - `apiLatencyMs`: The measured time in milliseconds
   * - `walletAddress`: The wallet address that signed the message
   *
   * In your implementation, set the default to STANDARD_SOLANA_MESSAGE:
   * ```typescript
   * async signMessageSolana(message: string = STANDARD_SOLANA_MESSAGE): Promise<ServiceResult>
   * ```
   *
   * @param message - The test message to sign (should default to STANDARD_SOLANA_MESSAGE in implementation)
   * @returns ServiceResult with signature, API latency in milliseconds, and wallet address
   */
  signMessageSolana?(message: string): Promise<ServiceResult>;

}

/**
 * Result from a wallet service operation
 *
 * Return this from signMessageEthereum() and signMessageSolana()
 */
export interface ServiceResult {
  /** The signature from your API */
  signature: string;

  /**
   * Time for JUST the API call in milliseconds
   *
   * Measure this by wrapping only your API call:
   * const apiStart = performance.now();
   * const result = await yourAPI.call();
   * const apiEnd = performance.now();
   * const apiLatencyMs = apiEnd - apiStart;
   */
  apiLatencyMs: number;

  /**
   * The wallet address that signed this message (REQUIRED for verification)
   * All signatures are verified to ensure validity
   */
  walletAddress: string;
}

// ===== STANDARD BENCHMARK MESSAGES =====
// These messages are used consistently across all services to ensure fair comparison

/**
 * Standard message for Ethereum signing benchmarks
 * All services will sign this exact message for consistent testing
 */
export const STANDARD_ETHEREUM_MESSAGE = "Hello, Ethereum";

/**
 * Standard message for Solana signing benchmarks
 * All services will sign this exact message for consistent testing
 */
export const STANDARD_SOLANA_MESSAGE = "Hello, Solana";
