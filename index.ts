/**
 * V2 Wallet Latency Benchmark - CLI Entry Point
 *
 * Supports both interactive and command-line modes:
 *   npm run benchmark              # Interactive prompts
 *   npm run benchmark privy both 20    # Direct command
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import prompts from 'prompts';
import { discoverServices, getAvailableServices } from './benchmarking/service-discovery.js';
import { runBenchmarks } from './benchmarking/runner.js';
import { calculateAllStats, formatServiceStats, rankServicesByChain, type ServiceStats } from './benchmarking/statistics.js';
import { capitalize } from './benchmarking/utils.js';
import type { BenchmarkConfig } from './benchmarking/runner.js';

interface CLIArgs {
  service?: string;
  chain?: 'ethereum' | 'solana' | 'both';
  iterations?: number;
}

function showHelp() {
  console.log(`V2 Wallet Service Benchmark Tool

Usage: npm run benchmark [<service> <chain> <iterations>]

Interactive Mode:
  npm run benchmark
    Launches interactive prompts to select service, chain, and iterations

Command-Line Mode:
  npm run benchmark <service> <chain> <iterations>

  Arguments:
    service      Service name (e.g., privy, turnkey, dynamic) or "all"
    chain        ethereum, solana, or both
    iterations   Number of iterations per chain (e.g., 20)

Examples:
  npm run benchmark privy ethereum 20    # Benchmark Privy on Ethereum with 20 iterations
  npm run benchmark privy solana 20      # Benchmark Privy on Solana with 20 iterations
  npm run benchmark privy both 20        # Benchmark Privy on both chains with 20 iterations
  npm run benchmark all both 20          # Benchmark all services on both chains

Help:
  npm run benchmark help                 # Show this help message`);
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);

  // Check for help
  if (args[0] === 'help') {
    showHelp();
    process.exit(0);
  }

  if (args.length === 0) {
    return {}; // Interactive mode
  }

  if (args.length < 3) {
    console.log('Error: Invalid arguments\n');
    showHelp();
    process.exit(1);
  }

  const [service, chain, iterationsStr] = args;

  // Validate chain
  if (chain !== 'ethereum' && chain !== 'solana' && chain !== 'both') {
    console.log('Error: chain must be "ethereum", "solana", or "both"');
    process.exit(1);
  }

  // Parse iterations
  const iterations = parseInt(iterationsStr, 10);
  if (isNaN(iterations) || iterations < 1) {
    console.log('Error: iterations must be a positive number');
    process.exit(1);
  }

  return { service, chain, iterations };
}

async function runInteractive() {
  console.log('🚀 Wallet Service Benchmark - Interactive Mode\n');

  // Get available services dynamically
  const availableServices = getAvailableServices();

  const serviceChoices = [
    { title: 'All Services', value: 'all' },
    ...availableServices.map(name => ({
      title: capitalize(name),
      value: name
    }))
  ];

  // Prompt for service
  const serviceResponse = await prompts({
    type: 'select',
    name: 'service',
    message: 'Which service would you like to test?',
    choices: serviceChoices,
    initial: 0,
  });

  if (!serviceResponse.service) {
    console.log('No service selected. Exiting.');
    process.exit(0);
  }

  // Prompt for chain
  const chainResponse = await prompts({
    type: 'select',
    name: 'chain',
    message: 'Which chain(s) would you like to benchmark?',
    choices: [
      { title: 'Both (Ethereum + Solana)', value: 'both' },
      { title: 'Ethereum only', value: 'ethereum' },
      { title: 'Solana only', value: 'solana' },
    ],
    initial: 0,
  });

  if (!chainResponse.chain) {
    console.log('No chain selected. Exiting.');
    process.exit(0);
  }

  // Prompt for iterations
  const iterationsResponse = await prompts({
    type: 'number',
    name: 'iterations',
    message: 'How many iterations per chain?',
    initial: 20,
    min: 1,
    max: 1000,
  });

  const iterations = iterationsResponse.iterations || 20;

  return {
    service: serviceResponse.service,
    chain: chainResponse.chain as 'ethereum' | 'solana' | 'both',
    iterations,
  };
}

function displayRankings(allStats: ServiceStats[], chain: 'ethereum' | 'solana') {
  const rankings = rankServicesByChain(allStats, chain);
  if (rankings.length === 0) return;

  console.log(`\n🏆 ${chain.toUpperCase()} RANKINGS:`);
  rankings.forEach(ranking => {
    const medal = ['🥇', '🥈', '🥉'][ranking.rank - 1] ?? `#${ranking.rank}`;
    console.log(`${medal} ${capitalize(ranking.serviceName)}: ${ranking.median.toFixed(2)}ms median, ${ranking.mean.toFixed(2)}ms avg, ${ranking.p95.toFixed(2)}ms p95`);
  });
}

async function runBenchmarkWithConfig(service: string, chain: 'ethereum' | 'solana' | 'both', iterations: number) {
  const config: BenchmarkConfig = {
    chain,
    iterations,
    warmupIterations: Math.min(3, Math.floor(iterations / 5)),
    delayMs: 100,
  };

  const chainDisplay = chain === 'both' ? 'Ethereum and Solana' : capitalize(chain);
  console.log(`🚀 Starting wallet service benchmark for ${chainDisplay} (${iterations} iterations)\n`);

  // Discover services
  const services = await discoverServices(service === 'all' ? undefined : service);

  if (services.size === 0) {
    console.log(`No services found matching: ${service}`);
    process.exit(1);
  }

  // Run benchmarks
  const results = await runBenchmarks(services, config);

  // Calculate statistics
  const allStats = calculateAllStats(results);

  // Display results
  console.log('='.repeat(60));
  console.log('📊 BENCHMARK RESULTS');
  console.log('='.repeat(60));

  if (allStats.length === 1) {
    // Single service - detailed view
    console.log(`\n${capitalize(allStats[0].serviceName)}:\n`);
    console.log(formatServiceStats(allStats[0]));
  } else {
    // Multiple services - rankings + detailed stats
    if (chain === 'ethereum' || chain === 'both') {
      displayRankings(allStats, 'ethereum');
    }

    if (chain === 'solana' || chain === 'both') {
      displayRankings(allStats, 'solana');
    }

    // Detailed stats for each service
    console.log('\n📈 DETAILED STATISTICS:\n');
    allStats.forEach((stats, index) => {
      if (index > 0) console.log('');
      console.log(`${capitalize(stats.serviceName)}:\n`);
      console.log(formatServiceStats(stats));
    });
  }

  console.log('');
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.service) {
      // Interactive mode
      const config = await runInteractive();
      await runBenchmarkWithConfig(config.service, config.chain, config.iterations);
    } else {
      // Command-line mode
      await runBenchmarkWithConfig(args.service!, args.chain!, args.iterations!);
    }

    console.log('✅ Benchmark completed successfully!');
  } catch (error: any) {
    console.error(`\n❌ Benchmark failed: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

// Run
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
