# 🤖 arb_arbitrage_scanner

`arb_arbitrage_scanner` is a high-performance, off-chain arbitrage engine designed to continuously scan Uniswap V3 liquidity pools on **Ethereum Mainnet** and **Arbitrum**. It evaluates forward and backward swap routes to detect real arbitrage opportunities. When a profitable trade is found, the scanner:

- 📣 Sends a real-time alert to **Discord**
- 🧠 Verifies profitability including **slippage and gas**
- ⚡ Triggers an **on-chain execution** by calling a smart contract

---

## ✨ Features

- 🔄 **Forward and Backward Path Simulation**
  - Forward: Token A → Token B
  - Backward: Token B → Token A
  - Confirms that `output_back > input_forward` after gas/slippage
- 🔍 **Uniswap V3 Path Optimization**
  - Selects optimal fee tiers (e.g., 500, 3000, 10000)
  - Calculates exact input/output via Uniswap Quoter V3
- 🔧 **Customizable Token Pairs and Thresholds**
  - Add/remove token pairs from config
  - Set minimum USD profit or token delta
- 🧱 **Smart Contract Execution**
  - Calls your deployed `Arbitrage.sol` or similar contract with trade params
- 🌐 **Multi-Chain Support**
  - Works on Ethereum Mainnet and Arbitrum
- 🛡️ **DRPC Integration**
  - Uses [DRPC](https://drpc.org/) to avoid rate-limits and RPC instability
- 📡 **Discord Webhook Alerts**
  - Instant notifications for every viable trade found

---

## 🔧 Tech Stack

| Tool                | Purpose                         |
| ------------------- | ------------------------------- |
| **NestJS/TS**       | Core logic and scripting        |
| **Uniswap V3 ABI**  | Route discovery and simulation  |
| **Ethers.js**       | Blockchain interaction          |
| **DRPC**            | High-throughput RPC calls       |
| **Discord Webhook** | Real-time alerting              |


## ⚙️ Installation

```bash
git clone https://github.com/vnkhoa02/arb_arbitrage.git
cd arb_arbitrage
npm install

git clone https://github.com/vnkhoa02/arb_arbitrage_scanner.git
cd arb_arbitrage_scanner
npm install
```