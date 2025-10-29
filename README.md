# SLATE

**Simple LATency Evaluation tool for wallet-as-a-service providers**

SLATE is a no-frills, open-source benchmarking tool for measuring signing latency for wallet-as-a-service providers across different chains.

Our work building embedded wallets and signing infrastructure at Privy is focused on three core characteristics: **security**, **flexibility** and **speed**.

Accordingly, we introduce SLATE: a Simple LATency Evaluation tool for wallet services. This is a tool we use to measure performance at Privy, and across the wallet landscape.

**[Setup](#setup)** | **[Usage](#running-slate)** | **[Contributing](#contributions)**

## Goals

The goals for SLATE are as follows:

1. **Simple**: SLATE should be easy to use and easy to run, helping builders use facts to drive architecture decisions for their stack.
2. **Extensible**: SLATE should make it easy to add any wallet services or blockchains to fit your testing needs.
3. **Reproducible**: SLATE provides consistent results across environments with standardized testing conditions across services.
4. **Global**: SLATE should account for latency across the globe and provide wide testing coverage.

## Limitations

It is important to note that SLATE measures **signing latency only** as provided by provider APIs - the time from request to response for signing operations.

Message preparation, encoding, and signature verification are explicitly excluded from timing to ensure fair comparison. We have plans to extend SLATE to include transaction submissions.

## Supported services

SLATE supports testing across Ethereum and Solana for the following service providers today:

- Privy
- Coinbase CDP
- Dfns
- Dynamic
- Para
- Turnkey

Go to [Contributions](#contributions) to add your own.

> [!NOTE]
> This benchmarks Privy's TEE-based wallet architecture. Privy also supports on-device signing with a typical latency of 5-20ms.
> [Learn more](https://x.com/privy_io/status/1973807933940228232).

---

# Running SLATE

## Setup

### 1. Clone SLATE to your workspace

```bash
# Clone and install
git clone https://github.com/privy-io/wallet-latency-benchmark.git
cd wallet-latency-benchmark
npm install

# Set up credentials
cp .env.example .env.local
# Edit .env.local with your service credentials

# Run benchmark
npm run benchmark
```

### 2. Add environment variables for services you want to test

Add your credentials to `.env.local`:

```env
YOURSERVICE_API_KEY=xxx
YOURSERVICE_API_SECRET=xxx
YOURSERVICE_ETHEREUM_WALLET_ADDRESS=0x...
YOURSERVICE_SOLANA_WALLET_ADDRESS=...
```

### 3. Run benchmark

Your service is automatically discovered:

```bash
npm run benchmark yourservice both 50
```

## Usage

### Interactive mode

To run interactive tests, run the following command. This will prompt you to select the service, chain, and iteration count for the test.

```bash
npm run benchmark
```

### Direct mode

If you'd like to run a test for a specific service non-interactively, you can use the following command:

```bash
npm run benchmark [service] [chain] [iterations]
```

**Examples:**
```bash
npm run benchmark privy ethereum 20      # Test Privy on Ethereum
npm run benchmark all both 50            # Test all services on both chains
npm run benchmark yourservice solana 100 # Test your service on Solana
```

> [!TIP]
> **Run this test across multiple regions:** see [Cross-region testing](#cross-region-testing) for instructions on benchmarking from different geographic locations.

---

# Understanding Outputs

## Sample output

```
🏆 ETHEREUM RANKINGS:
🥇 Privy: 152.06ms median, 152.17ms avg, 169.55ms p95
🥈 YourService: 178.34ms median, 180.22ms avg, 195.44ms p95

📈 DETAILED STATISTICS:
Privy:
  Iterations: 20 (20 success, 0 errors)
  Success Rate: 100.0%
  Mean: 152.17ms
  Median: 152.06ms
  P95: 169.55ms
  Range: 133.62ms - 172.16ms
```

## Key metrics

- **Median**: Median latency
- **Mean**: Average latency
- **P95/P99**: Edge-case latency
- **Std Dev**: Consistency across runs

Services are ranked by **median latency** (lower is better).

## Best practices for running SLATE

### Iteration count

- **5-10**: Quick sanity check
- **20-50**: Standard testing (recommended)
- **100+**: High-confidence production testing

### Environment considerations

- Stable network connection
- Test from same geographic region
- Use same wallet types (embedded vs. MPC)
- Test during similar time periods

---

# Cross-Region Testing

Run benchmarks from different AWS regions to measure geographic performance:

```bash
# Launch EC2 instance in target region
aws ec2 run-instances --region us-west-2 --instance-type t3.medium ...

# SSH and run benchmark
ssh ec2-user@<instance-ip>
git clone https://github.com/privy-io/wallet-latency-benchmark.git
cd wallet-latency-benchmark
npm install
npm run benchmark all both 50
```

**Recommended regions:**

- North America: `us-east-1`, `us-west-2`
- Europe: `eu-west-1`, `eu-central-1`
- Asia: `ap-southeast-1`, `ap-northeast-1`

---

# How SLATE works

Under the hood, SLATE is a simple benchmarking harness. It tests `signMessage` latency across various wallet-as-a-service providers.

### Clean separation of concerns

- **Services**: Pure wallet operations (you control timing)
- **Runner**: Executes iterations uniformly
- **Statistics**: Consistent calculations
- **Verification**: Post-timing signature validation

### What gets timed

✅ **Timed**: Only the actual API call

❌ **Not timed**: SDK initialization, message encoding, signature verification

All services receive:

- Same test messages
- Same warmup iterations
- Same delays between requests
- Same error handling
- Same verification process

---

# Contributions

SLATE accepts contributions. To do so, please open a PR to add a new service or functionality.

## Adding a new service

For each service you'd like to benchmark, create a new directory named with the service in the `v2/services/` directory.

### 1. Create service folder

```bash
mkdir v2/services/yourservice
```

### 2. Implement WalletService interface

Next, in the service folder you created, implement an `index.ts` file that implements the `WalletService` interface defined in [`v2/services/index.ts`](./services/index.ts). Your service needs to implement three methods:

- `initialize()`: Initializes your SDK client and loads credentials from environment variables
- `signMessageEthereum(message: string)`: Signs a message for Ethereum (using EIP-191 personal sign)
- `signMessageSolana(message: string)`: Signs a message for Solana

Within each signing function, use `performance.now()` to measure **only** the API call to your wallet service—the actual network request and response. Place `performance.now()` calls immediately before and after your service's signing method. Do not time message preparation, encoding, or signature formatting.

Each function must return a `ServiceResult` object with:

- `signature`: The signature string from your API
- `apiLatencyMs`: The measured time (in milliseconds) from `performance.now()`
- `walletAddress`: The wallet address that signed the message (required for verification)

You can access environment variables (configured in `.env.local`) anywhere in your implementation to load API keys, secrets, and wallet addresses.

#### Example implementation

```typescript
import type { WalletService, ServiceResult } from '../index';

export default class YourWalletService implements WalletService {
  async initialize(): Promise<void> {
    // Initialize your SDK and load credentials from environment variables
  }

  async signMessageEthereum(message: string): Promise<ServiceResult> {
    // Message preparation (not timed)
    const prepared = this.client.prepareMessage(message);

    // Time ONLY the API call
    const apiStart = performance.now();
    const result = await this.client.signEthereum(prepared);
    const apiEnd = performance.now();

    // Signature formatting (not timed)
    const signature = this.formatSignature(result);

    const serviceResult: ServiceResult = {
      signature,
      apiLatencyMs: apiEnd - apiStart,
      walletAddress: this.ethereumWalletAddress,
    };

    return serviceResult;
  }

  async signMessageSolana(message: string): Promise<ServiceResult> {
    // Same pattern for Solana
    const apiStart = performance.now();
    const result = await this.client.signSolana(message);
    const apiEnd = performance.now();

    const serviceResult: ServiceResult = {
      signature: result.signature,
      apiLatencyMs: apiEnd - apiStart,
      walletAddress: this.solanaWalletAddress,
    };

    return serviceResult;
  }
}
```

#### Key points

- Export as `export default class`
- Implement the `WalletService` interface from `v2/services/index.ts`
- Time **only** the API call with `performance.now()` (immediately before and after the network request)
- Load credentials from environment variables using `process.env`
- Return `signature`, `apiLatencyMs`, and `walletAddress` in the `ServiceResult`

> 💡 **Reference implementation:** See [`v2/services/privy/index.ts`](./services/privy/index.ts) for a complete working example of the `WalletService` interface.

---

# License

SLATE runs under an MIT License - see [LICENSE](LICENSE) for details.

---

**Built by [Privy](https://privy.io)** - Making wallet infrastructure faster and more reliable for everyone.
