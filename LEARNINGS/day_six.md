# Day Six — The Core Trading Engine

**Date:** 26-04-2026  
**File:** `apps/engine-service/src/index.ts`

---

## What is the Engine?

The engine is the **brain** of the entire trading platform. When a user places a trade, closes a position, or when prices move — it is the engine that decides what happens next.

Think of it like a **referee at a sports match**. It watches everything in real time, enforces the rules (margin limits, stop losses, take profits), and makes sure money moves to the right place at the right time.

---

## How Does It Receive Work?

The engine does **not** expose an HTTP API. Instead it reads from a **Redis Stream** called `engine-stream`.

```
[API / other service]
        |
        | pushes message to Redis Stream
        v
  engine-stream  ←──── engine reads this in an infinite loop
        |
        | after processing, pushes result to
        v
  callback-queue  ←──── API reads the result here
```

This is a **queue-based** pattern. The engine sits in a `while(true)` loop using `XREAD BLOCK 0` — it sleeps until a new message arrives, wakes up, processes it, then sleeps again. Zero CPU wasted polling.

---

## What Messages Can the Engine Handle?

There are **three message types** (`kind`):

### 1. `price-update`

Live price feed comes in (bid price, ask price for a symbol like BTC).

What the engine does:
- Stores the latest bid/ask prices in memory
- Loops over **every open order** that matches the symbol
- Checks if any order should be liquidated at the new price

**Longs** use `bid price` (what the market will pay you), **shorts** use `ask price` (what the market charges you). This mirrors real exchange behavior.

---

### 2. `create-order`

User wants to open a trade.

Step by step what the engine does:

1. **Validate** — checks all required fields: `userId`, `asset`, `side`, `qty`, `orderId`
2. **Duplicate check** — if same `orderId` already exists in memory, skip it (idempotent)
3. **Price check** — no price in memory? Reject with `no_price`
4. **Opening price** — long order opens at `ask price`, short opens at `bid price`
5. **Margin calculation** — `margin = (openingPrice × qty) / leverage`
6. **Balance check** — does the user have enough USDC? If not → `insufficient_balance`
7. **Deduct margin** — subtract margin from user's in-memory balance, persist to DB
8. **Add to open_orders** — push the order into the in-memory array
9. **Callback** — push `created` status to `callback-queue` so the API knows it worked

---

### 3. `close-order`

User manually closes their position.

1. Find the order in `open_orders` by `orderId` and `userId`
2. Calculate PnL using current market price
3. Return `initialMargin + PnL` back to user's USDC balance
4. Mark order as `closed` in the database
5. Remove from `open_orders` array
6. Push result to `callback-queue`

---

## Where Are Balances Stored?

Balances live in **two places**:

| Place | What it is | Why |
|---|---|---|
| In-memory `balances` object | Fast lookup during order processing | DB round-trips are slow |
| PostgreSQL via Prisma | Persistent, survives restarts | Single source of truth |

When the engine starts, it calls `loadSnapshot()` which loads all open orders from DB into memory. Balances start empty in memory and get populated lazily — when an order comes in with a `balanceSnapshot` attached, it reads from that snapshot first.

---

## What is Liquidation?

Liquidation is when the engine **forcefully closes** a position. There are three triggers:

### Take Profit (TP)
User set a target price. When price crosses it in the right direction → close the trade with profit.

```
Long  → closes when currentPrice >= takeProfit
Short → closes when currentPrice <= takeProfit
```

### Stop Loss (SL)
User set a floor to limit losses.

```
Long  → closes when currentPrice <= stopLoss
Short → closes when currentPrice >= stopLoss
```

### Margin Liquidation
If losses eat 95% of the margin, the exchange force-closes to protect itself.

```
initialMargin = (openingPrice × qty) / leverage
remainingMargin = initialMargin + currentPnL

if remainingMargin <= initialMargin × 0.05 → LIQUIDATED
```

On liquidation for margin: user gets back whatever tiny `remainingMargin` is left (could be near zero).  
On TP/SL: user gets back `initialMargin + pnl`.

---

## The Snapshot Loop

Every **10 seconds**, `createSnapshot()` runs automatically via `setInterval`.

It does two things:
1. Writes every open order's current PnL to the database (so the UI can show live PnL)
2. Calls `checkLiquidations()` as a safety net — catches any orders that should have been liquidated but weren't caught by the price-update flow

---

## PnL Formula

```
Long  PnL = (currentPrice - openingPrice) × qty
Short PnL = (openingPrice - currentPrice) × qty
```

Longs profit when price goes **up**. Shorts profit when price goes **down**.

---

## How Numbers Are Stored in DB

Raw floats are not stored directly. Everything is stored as **integers with scaling**:

| Field | Scale | Example |
|---|---|---|
| Price | × 10,000 | $95,000.00 → stored as `950000000` |
| Qty | × 100 | 0.5 BTC → stored as `50` |
| PnL | × 10,000 | $12.3456 → stored as `123456` |
| Balance | × 100 | $1000.00 → stored as `100000` |

This avoids floating point precision bugs in financial calculations — a classic gotcha.

---

## Summary — The Full Flow

```
User opens trade
     │
     ▼
API pushes "create-order" → engine-stream
     │
     ▼
Engine validates → checks price → checks balance
     │
     ▼
Deducts margin → adds to open_orders → confirms via callback-queue
     │
     ▼
Price updates keep arriving (price-update messages)
     │
     ▼
Engine checks every open order against new price → liquidate if needed
     │
     ▼
User closes trade manually
     │
     ▼
API pushes "close-order" → engine-stream
     │
     ▼
Engine calculates final PnL → returns funds → removes order
```

---

## Key Takeaways

- Engine is **event-driven**, not request-driven. Redis Stream is the transport.
- All hot state (orders, balances, prices) lives **in memory** for speed.
- DB is the **persistence layer** — written to on every balance change and snapshotted every 10s.
- Liquidation happens **on every price update** and also as a **periodic safety check**.
- Numbers in DB are **scaled integers** — no floats stored directly.
