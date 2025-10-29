/**
 * Centralized Statistics Calculator
 *
 * Single source of truth for all statistical calculations.
 * Prevents bias from different implementations and ensures consistency.
 */

import type { BenchmarkResult, ChainBenchmarkResult, SigningResult } from './runner.js';
import { capitalize } from './utils.js';

/**
 * Statistics for a single chain benchmark
 */
export interface ChainStats {
  chain: 'ethereum' | 'solana';
  serviceName: string;
  iterations: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
  standardDeviation: number;
  variance: number;
  total: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  latencies: number[];
  verifiedCount: number;
  verificationFailures: number;
}

/**
 * Complete statistics for a service (both chains)
 */
export interface ServiceStats {
  serviceName: string;
  ethereum?: ChainStats;
  solana?: ChainStats;
  consolidated?: ChainStats; // Combined stats when both chains are run
}

// ===== HELPER FUNCTIONS =====

/**
 * Get chain stats from service stats
 */
function getChainStats(service: ServiceStats, chain: 'ethereum' | 'solana'): ChainStats | undefined {
  return chain === 'ethereum' ? service.ethereum : service.solana;
}

/**
 * Extract latencies from signing results
 */
function extractLatencies(results: SigningResult[]): number[] {
  return results
    .filter(r => r.success && r.apiLatencyMs !== undefined)
    .map(r => r.apiLatencyMs!);
}

/**
 * Count verification results
 */
function countVerifications(results: SigningResult[]): { verifiedCount: number; verificationFailures: number } {
  const verifiedCount = results.filter(r => r.verified === true).length;
  const verificationFailures = results.filter(r => r.verified === false).length;
  return { verifiedCount, verificationFailures };
}

/**
 * Calculate percentile from sorted array
 */
function getPercentile(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;

  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedArray[lower];
  }

  // Linear interpolation
  const weight = index - lower;
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Compute statistics from latencies
 */
function computeStats(
  latencies: number[],
  successCount: number,
  errorCount: number,
  verifiedCount: number,
  verificationFailures: number
): Omit<ChainStats, 'chain' | 'serviceName'> {
  const iterations = successCount + errorCount;

  if (latencies.length === 0) {
    return {
      iterations,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      p95: 0,
      p99: 0,
      standardDeviation: 0,
      variance: 0,
      total: 0,
      successCount,
      errorCount,
      successRate: 0,
      latencies: [],
      verifiedCount,
      verificationFailures,
    };
  }

  // Sort for percentile calculations
  const sortedLatencies = [...latencies].sort((a, b) => a - b);

  // Basic statistics
  const total = latencies.reduce((sum, lat) => sum + lat, 0);
  const mean = total / latencies.length;
  const min = sortedLatencies[0];
  const max = sortedLatencies[sortedLatencies.length - 1];
  const median = getPercentile(sortedLatencies, 50);

  // Percentiles
  const p95 = getPercentile(sortedLatencies, 95);
  const p99 = getPercentile(sortedLatencies, 99);

  // Variability metrics
  const variance = latencies.reduce((sum, lat) => sum + Math.pow(lat - mean, 2), 0) / latencies.length;
  const standardDeviation = Math.sqrt(variance);

  // Success metrics
  const successRate = iterations > 0 ? (successCount / iterations) * 100 : 0;

  return {
    iterations,
    mean,
    median,
    min,
    max,
    p95,
    p99,
    standardDeviation,
    variance,
    total,
    successCount,
    errorCount,
    successRate,
    latencies: sortedLatencies,
    verifiedCount,
    verificationFailures,
  };
}

/**
 * Calculate statistics from chain benchmark results
 */
function calculateChainStats(result: ChainBenchmarkResult): ChainStats {
  const { chain, serviceName, results, successCount, errorCount } = result;

  const latencies = extractLatencies(results);
  const { verifiedCount, verificationFailures } = countVerifications(results);
  const stats = computeStats(latencies, successCount, errorCount, verifiedCount, verificationFailures);

  return {
    chain,
    serviceName,
    ...stats,
  };
}

/**
 * Calculate statistics from benchmark results
 */
function calculateServiceStats(result: BenchmarkResult): ServiceStats {
  const stats: ServiceStats = {
    serviceName: result.serviceName,
  };

  if (result.ethereum) {
    stats.ethereum = calculateChainStats(result.ethereum);
  }

  if (result.solana) {
    stats.solana = calculateChainStats(result.solana);
  }

  // If both chains were benchmarked, create consolidated stats
  if (result.ethereum && result.solana) {
    stats.consolidated = calculateConsolidatedStats(
      result.ethereum,
      result.solana,
      result.serviceName
    );
  }

  return stats;
}

/**
 * Calculate consolidated statistics from both chains
 */
function calculateConsolidatedStats(
  ethereum: ChainBenchmarkResult,
  solana: ChainBenchmarkResult,
  serviceName: string
): ChainStats {
  // Combine latencies from both chains
  const ethereumLatencies = extractLatencies(ethereum.results);
  const solanaLatencies = extractLatencies(solana.results);
  const allLatencies = [...ethereumLatencies, ...solanaLatencies];

  // Combine counts from both chains
  const successCount = ethereum.successCount + solana.successCount;
  const errorCount = ethereum.errorCount + solana.errorCount;

  // Combine verification results from both chains
  const allResults = [...ethereum.results, ...solana.results];
  const { verifiedCount, verificationFailures } = countVerifications(allResults);

  const stats = computeStats(allLatencies, successCount, errorCount, verifiedCount, verificationFailures);

  return {
    chain: 'ethereum', // Placeholder for 'both'
    serviceName,
    ...stats,
  };
}

/**
 * Calculate statistics for multiple services
 */
export function calculateAllStats(results: BenchmarkResult[]): ServiceStats[] {
  return results.map(calculateServiceStats);
}

/**
 * Service ranking for comparison
 */
export interface ServiceRanking {
  serviceName: string;
  chain: 'ethereum' | 'solana';
  rank: number;
  median: number;
  mean: number;
  p95: number;
  successRate: number;
}

/**
 * Rank services by median latency for a specific chain
 */
export function rankServicesByChain(
  stats: ServiceStats[],
  chain: 'ethereum' | 'solana'
): ServiceRanking[] {
  // Extract chain stats and filter out services without this chain or 0% success rate
  const chainStats = stats
    .map(s => getChainStats(s, chain))
    .filter((s): s is ChainStats => s !== undefined && s.successRate > 0);

  if (chainStats.length === 0) {
    return [];
  }

  // Create rankings and sort by median (lower is better)
  const rankings = chainStats.map(stat => ({
    serviceName: stat.serviceName,
    chain,
    median: stat.median,
    mean: stat.mean,
    p95: stat.p95,
    successRate: stat.successRate,
    rank: 0,
  }));

  // Sort by median (lower is better) and assign ranks
  rankings.sort((a, b) => a.median - b.median);
  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return rankings;
}

/**
 * Format chain statistics for display
 */
function formatChainStats(stats: ChainStats): string {
  const chainName = capitalize(stats.chain);
  let output = `${chainName}:
  Iterations: ${stats.iterations} (${stats.successCount} success, ${stats.errorCount} errors)
  Success Rate: ${stats.successRate.toFixed(1)}%
  Verified: ${stats.verifiedCount}/${stats.successCount}`;

  if (stats.verificationFailures > 0) {
    output += `\n  ⚠️  Verification failures: ${stats.verificationFailures}`;
  }

  output += `
  Mean: ${stats.mean.toFixed(2)}ms
  Median: ${stats.median.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms
  P99: ${stats.p99.toFixed(2)}ms
  Range: ${stats.min.toFixed(2)}ms - ${stats.max.toFixed(2)}ms
  Std Dev: ${stats.standardDeviation.toFixed(2)}ms`;

  return output.trim();
}

/**
 * Format service statistics for display
 */
export function formatServiceStats(stats: ServiceStats): string {
  const parts: string[] = [];

  if (stats.ethereum) {
    parts.push(formatChainStats(stats.ethereum));
  }

  if (stats.solana) {
    parts.push(formatChainStats(stats.solana));
  }

  if (stats.consolidated) {
    parts.push(formatConsolidatedStats(stats.consolidated));
  }

  return parts.join('\n\n');
}

/**
 * Format consolidated statistics for display
 */
function formatConsolidatedStats(stats: ChainStats): string {
  let output = `Consolidated (Both Chains):
  Iterations: ${stats.iterations} (${stats.successCount} success, ${stats.errorCount} errors)
  Success Rate: ${stats.successRate.toFixed(1)}%
  Verified: ${stats.verifiedCount}/${stats.successCount}`;

  if (stats.verificationFailures > 0) {
    output += `\n  ⚠️  Verification failures: ${stats.verificationFailures}`;
  }

  output += `
  Mean: ${stats.mean.toFixed(2)}ms
  Median: ${stats.median.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms
  P99: ${stats.p99.toFixed(2)}ms
  Range: ${stats.min.toFixed(2)}ms - ${stats.max.toFixed(2)}ms
  Std Dev: ${stats.standardDeviation.toFixed(2)}ms`;

  return output.trim();
}

