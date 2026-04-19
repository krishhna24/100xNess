# Day 01 — Monorepo Architecture & System Foundations

**Saturday, April 18, 2026**

## 🎯 Objective

Set up a scalable monorepo using Turborepo to support a high-performance synthetic trading platform (Exness-like system).

---

## 🏗️ High-Level Architecture

This project follows a **modular microservice architecture inside a monorepo**.

### Apps

* `api-service` → Handles REST/WebSocket APIs (user requests, orders, auth)
* `engine-service` → Core trading logic (order matching / synthetic price execution)
* `price-poller-service` → Fetches external or synthetic price feeds
* `web` → Frontend (Next.js UI)

### Packages (Shared Layer)

* `db` → Database schema + ORM config
* `redis` → Caching / pub-sub layer
* `ui` → Shared React components
* `eslint-config` → Shared lint rules
* `typescript-config` → Shared TS configs

---

## ⚙️ Why Turborepo?

Turborepo is used for:

* **Task orchestration** [build, dev, lint across apps (orchetration means: automating systme in a way that multiple systems-tasks c0ordinate with each other )]
* **Caching** → avoids re-running unchanged builds
* **Dependency graph awareness**
* **Parallel execution**

Key idea:

> Only rebuild what actually changed.
"If inputs didn’t change → reuse previous result → don’t run task again."

---

## 📦 Monorepo Strategy

**Problem:** Multiple services drift out of sync, shared code gets duplicated, and every change becomes slow and error-prone.

**Solution (Monorepo):** Keep everything in one place so changes are consistent, shared code is reused, and updates happen together.

**Solution (Turbo):** Run only what changed and reuse previous results, making builds and development fast instead of painfully slow.

We are using:

* `pnpm workspaces` → dependency management
* `turbo.json` → pipeline definition

### Folder Philosophy

* `apps/` = runnable services
* `packages/` = reusable logic / data-sources
* strict separation between **execution layer** and **shared layer**

---

## 🔁 Service Communication Plan

(Not implemented yet — design phase)

Planned communication:

* API → Engine → Redis (pub/sub)
* Engine → emits trade events
* Price Poller → pushes price updates to Redis
* Web → connects via WebSockets

---

## 🧱 Initial Design Decisions

### 1. Microservices inside Monorepo

Pros:

* Faster development
* Shared types
* Easier refactoring

Cons:

* Requires strict boundaries

---

### 2. Redis as Event Bus

Reason:

* Low latency
* Pub/Sub for real-time updates

---

### 3. Type Sharing via `packages/`

Avoid:

* duplicating types
* version mismatch bugs

---

## 🧪 What I Set Up Today

* Initialized Turborepo
* Configured pnpm workspace
* Created base folder structure
* Added shared configs (ESLint, TS)
* Bootstrapped Next.js app
* Created core services (empty shells)

---

## ⚠️ Challenges Faced

* Understanding Turborepo pipeline behavior
* Deciding service boundaries early
* Structuring shared packages properly

---

## 💡 Key Learnings

* Monorepo ≠ messy repo → needs strict discipline
* Turborepo works best when tasks are clearly defined
* Early architecture decisions matter a LOT for scaling systems like trading engines

---

## 🚀 Next Steps (Day 02)

* Setup database layer (`packages/db`)
* Implement Redis connection layer
* Start designing order execution flow
* Define API contracts between services

---

## 🧠 Mental Model Going Forward

Think of system as:

User → API → Engine → Redis → Web UI

Everything revolves around:

* **low latency**
* **event-driven updates**
* **consistent state**

---

## 🧾 Notes

### Real Broker vs Market Maker vs Synthetic System

#### Real Broker (ECN/STP Model)
- Routes client orders directly to an exchange or pool of liquidity providers (LPs).
- Revenue: commissions per trade, spreads.
- Risk: near zero. They are pass-through.
- Example: Interactive Brokers, most Forex ECN brokers.

#### Market Maker (CFD Broker)
- Creates a synthetic market on top of real prices (e.g., a CFD on Apple stock).
- Takes the opposite side of most client trades internally (B-booking).
- Hedges selectively when client positions get too large.
- The "real price" is used as a reference for settlement, but execution is internal.
- Revenue: spreads + harvesting losses from traders who lose.
- Example: IG Group, Plus500, most retail Forex brokers.

#### Synthetic Index System (e.g., Deriv Volatility Indices)
- No underlying asset exists. Price is purely algorithmic.
- Platform generates a continuous price stream using RNG + volatility parameters.
- All trades are internalized. There is no external hedge possible (there is nothing to hedge against).
- Revenue: entirely from spread + expected value edge in price generation + trader losses.
- Example: Deriv's Volatility 75, Volatility 100(1s), Crash/Boom indices.

---
### Where Does Profit Come From?

The synthetic platform operates as the house. Profit sources, ranked by magnitude:

1. **Spread (primary):** The bid/ask spread is always in the platform's favor. A trader buying at ask and selling at bid pays the spread on every round trip.

2. **Expected value edge:** In products like binary options or multipliers with fixed payout ratios, the payout is set slightly below the fair-value payout for a fair coin flip. If the fair win probability is 50%, the platform pays out 95% of stake — over millions of trades, this creates a reliable edge.

3. **Loss harvesting (B-book internalization):** Since most retail traders lose, internalizing their trades means their losses become the platform's profit.

4. **Funding/rollover fees:** For positions held overnight, swap/rollover fees are charged.

5. **Inactivity fees, withdrawal fees:** Secondary, but real.

---
## Leverage

**Definition:**
Leverage is using borrowed capital to control a larger position than your own money.

---

### 🧠 Intuition
Small capital → larger trade size → amplified profit **and** loss.

---

### 📊 Formula
Position Size = Capital × Leverage

---

### ⚙️ Example

- Capital: $100
- Leverage: 10x
- Position Size: $1000

**Price moves +1% → Profit = $10**
**Price moves -1% → Loss = $10**

---

### 💣 Key Risk

Losses scale fast with leverage.

If losses reach your margin → position is **liquidated** (force closed).

---

### ⚠️ Liquidation

- Occurs when your loss ≈ your capital
- Example:
  - 10x leverage
  - ~10% adverse move → full loss

---

### 🧠 In Trading Systems

Leverage affects:
- Margin calculation
- Risk engine
- PnL calculation
- Liquidation logic

---

### 📌 Summary

- Amplifies gains and losses
- Higher leverage = higher risk
- Requires margin to maintain position
- Can wipe out capital quickly

---
