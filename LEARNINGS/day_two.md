# Day 02 — Trading Engine Deep Dive: Core Concepts from First Principles

**Saturday, April 19, 2026**

Welcome to **Day 02** of building a realistic crypto perpetual futures trading engine!

This document breaks down the fundamental theory of trading — explained from **first principles** — with clear analogies, real-world examples, precise mathematics, and direct ties to the codebase in this repository.

Whether you're a beginner learning how leveraged trading works or a developer understanding why the engine behaves a certain way, this guide will give you a solid mental model. All concepts here map directly to the simulation we're building (no actual asset ownership — just price-tracking **positions** similar to CFDs or perpetual futures).

---

## What Is Trading?

**Definition:**
Trading is the act of exchanging one asset for another with the **expectation of making a profit** based on future price movements.

### Simple Analogy (Real-World Goods)
Imagine umbrellas cost **$5** each on a sunny day but rise to **$15** during the rainy season.
You buy 100 umbrellas now for **$500** total.
Later, you sell them all for **$1,500**.
**Profit = $1,000**.

You're not "using" the umbrellas — you're speculating on their **future value**.

### In Crypto Trading
You're betting on the **future price** of Bitcoin (or any asset).
- If you believe BTC will rise from **$55,000** to **$60,000**, you **go Long** (buy) now and sell later at the higher price.
- If you believe it will fall, you **go Short** (sell) now and buy back cheaper later.

**Important note for this repo:**
Users do **not** actually own or hold BTC. Instead, they open **positions** — derivative contracts that track price changes. This is very close to real **perpetual futures** or **CFD (Contract for Difference)** trading on exchanges like Binance, Bybit, or Backpack.

---

## What Is an Order?

An **order** is your instruction to the exchange: "I want to open or close a position at specific conditions."

### Market Order
- **Executes immediately** at the best available current price.
- Example: "Buy BTC **right now**, whatever the price is."
- **Pros:** Fast execution.
- **Cons:** You might get a slightly worse price due to market movement or spread.
- **In this repo:** We use **market orders exclusively**. All orders fill instantly at the current bid/ask price. This simplifies the simulation while staying realistic.

### Limit Order
- Executes **only** when the price reaches your specified level.
- Example: "Buy BTC **only if** it drops to $50,000."
- **Pros:** More control over entry price.
- **Cons:** May never fill if the market doesn't reach your level.
- **In this repo:** Not implemented (focus is on core mechanics first).

---

## Long vs Short Positions (Bullish vs Bearish Bets)

### Going Long (Bullish)
You believe the price will **go UP**.

**Example:**
- You open a Long position at **$55,000**.
- Price rises to **$60,000**.
- **Profit = $60,000 - $55,000 = $5,000 per BTC**.

**In this repo (realistic mechanics):**
- Long positions **open** at the **ASK price** (what sellers are asking — you pay more).
- Long positions **close** at the **BID price** (what buyers are bidding — you receive less).
- This accurately simulates the **bid-ask spread** cost.

### Going Short (Bearish)
You believe the price will **go DOWN**.

**Example:**
- You open a Short position at **$55,000**.
- Price falls to **$50,000**.
- **Profit = $55,000 - $50,000 = $5,000 per BTC**.

**Real-World Analogy (Borrowing):**
You borrow a car worth **$20,000**, sell it immediately for $20,000 cash.
Later, the price drops to **$15,000**. You buy it back for $15,000, return the car to the lender, and keep the **$5,000** difference.

**In this repo:**
- Short positions **open** at the **BID price** (you sell at the higher buyer price).
- Short positions **close** at the **ASK price** (you buy back at the higher seller price).

**Code reference:**
`apps/engine-service/src/index.ts`
```typescript
const openingPrice = side === "long" ? askPrice : bidPrice;
