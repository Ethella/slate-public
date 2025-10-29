/**
 * Benchmark Runner
 *
 * Executes signing benchmarks on wallet services and collects timing data.
 */

import type { WalletService, ServiceResult } from '../services/index.js';
import { STANDARD_ETHEREUM_MESSAGE, STANDARD_SOLANA_MESSAGE } from '../services/index.js';
import { capitalize, sleep } from './utils.js';
import { verifyEthereumSignature, verifySolanaSignature, type VerificationResult } from './verification.js';

/**
 * Configuration for a benchmark run
 */
export interface BenchmarkConfig {
  /** Which chain(s) to bencwhmark */
  chain: 'ethereum' | 'solana' | 'both';

  /** Number of signing iterations to perform */
  iterations: number;

  /** Number of warmup iterations (not included in results) */
  warmupIterations?: number;

  /** Delay between requests in milliseconds */
  delayMs?: number;
}

/**
 * Result from a single signing operation
 */
export interface SigningResult {
  success: boolean;
  signature?: string;
  apiLatencyMs?: number;
  walletAddress?: string;
  error?: string;
  verified?: boolean;
}

/**
 * Results from benchmarking a single chain
 */
export interface ChainBenchmarkResult {
  chain: 'ethereum' | 'solana';
  serviceName: string;
  results: SigningResult[];
  successCount: number;
  errorCount: number;
}

/**
 * Complete benchmark results for a service
 */
export interface BenchmarkResult {
  serviceName: string;
  ethereum?: ChainBenchmarkResult;
  solana?: ChainBenchmarkResult;
}

/**
 * Chain-specific methods for signing and verification
 */
interface ChainMethods {
  message: string;
  sign: (service: WalletService, message: string) => Promise<ServiceResult>;
  verify: (message: string, signature: string, address: string) => Promise<VerificationResult>;
}

/**
 * Get chain-specific methods
 */
function getChainMethods(chain: 'ethereum' | 'solana'): ChainMethods {
  if (chain === 'ethereum') {
    return {
      message: STANDARD_ETHEREUM_MESSAGE,
      sign: (s, m) => s.signMessageEthereum!(m),
      verify: verifyEthereumSignature,
    };
  }
  return {
    message: STANDARD_SOLANA_MESSAGE,
    sign: (s, m) => s.signMessageSolana!(m),
    verify: verifySolanaSignature,
  };
}

/**
 * Run benchmark for a single service
 */
export async function runBenchmark(
  service: WalletService,
  serviceName: string,
  config: BenchmarkConfig
): Promise<BenchmarkResult> {
  const displayName = capitalize(serviceName);
  console.log(`\n📈 Benchmarking ${displayName}...`);
  try {
    await service.initialize();
    console.log(`✅ ${displayName} initialized\n`);
  } catch (error: any) {
    console.log(`❌ ${displayName} initialization failed: ${error.message}`);
    throw error;
  }

  const result: BenchmarkResult = {
    serviceName,
  };

  // Run Ethereum benchmark if requested
  if (config.chain === 'ethereum' || config.chain === 'both') {
    console.log(`Running Ethereum benchmark for ${displayName}...`);
    result.ethereum = await runChainBenchmark(
      service,
      serviceName,
      'ethereum',
      config
    );
    console.log('');
  }

  // Run Solana benchmark if requested
  if (config.chain === 'solana' || config.chain === 'both') {
    // Check if service supports Solana
    if (typeof service.signMessageSolana !== 'function') {
      console.log(`${displayName} does not support Solana, skipping`);
    } else {
      console.log(`Running Solana benchmark for ${displayName}...`);
      result.solana = await runChainBenchmark(
        service,
        serviceName,
        'solana',
        config
      );
      console.log('');
    }
  }

  return result;
}

/**
 * Run benchmark for a specific chain
 */
async function runChainBenchmark(
  service: WalletService,
  serviceName: string,
  chain: 'ethereum' | 'solana',
  config: BenchmarkConfig
): Promise<ChainBenchmarkResult> {
  const results: SigningResult[] = [];
  const warmupIterations = config.warmupIterations ?? 2;
  const totalIterations = warmupIterations + config.iterations;

  // Get chain-specific methods
  const methods = getChainMethods(chain);

  // Run warmup + benchmark iterations
  for (let i = 0; i < totalIterations; i++) {
    const isWarmup = i < warmupIterations;
    const iterationNumber = isWarmup ? `W${i + 1}` : `${i - warmupIterations + 1}`;

    try {
      // Call signing method
      const serviceResult = await methods.sign(service, methods.message);

      // Verify signature (NOT TIMED - always verify)
      const verifyResult = await methods.verify(methods.message, serviceResult.signature, serviceResult.walletAddress);

      const verified = verifyResult.valid;

      if (!verifyResult.valid) {
        console.log(`  ⚠️  Signature verification failed: ${verifyResult.error}`);
      }

      // Display timing for each iteration
      if (isWarmup) {
        console.log(`  Warmup ${iterationNumber}: ${serviceResult.apiLatencyMs.toFixed(2)}ms ✓`);
      } else {
        console.log(`  Iteration ${iterationNumber}: ${serviceResult.apiLatencyMs.toFixed(2)}ms ✓`);
      }

      // Only record non-warmup iterations
      if (!isWarmup) {
        results.push({
          success: true,
          signature: serviceResult.signature,
          apiLatencyMs: serviceResult.apiLatencyMs,
          walletAddress: serviceResult.walletAddress,
          verified,
        });
      }

      // Add delay between requests if configured
      if (config.delayMs && i < totalIterations - 1) {
        await sleep(config.delayMs);
      }

    } catch (error: any) {
      // Display error
      console.log(`  ${isWarmup ? 'Warmup' : 'Iteration'} ${iterationNumber}: ❌ ${error.message}`);

      // Only record errors for non-warmup iterations
      if (!isWarmup) {
        results.push({
          success: false,
          error: error.message,
        });
      }
    }
  }

  // Calculate success/error counts
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;

  return {
    chain,
    serviceName,
    results,
    successCount,
    errorCount,
  };
}

/**
 * Run benchmarks for multiple services
 */
export async function runBenchmarks(
  services: Map<string, WalletService>,
  config: BenchmarkConfig
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const [serviceName, service] of services) {
    try {
      const result = await runBenchmark(service, serviceName, config);
      results.push(result);
    } catch (error: any) {
      console.log(`${serviceName} benchmark failed: ${error.message}, skipping`);
    }
  }

  return results;
}
