# Day 03 - [Topic / Focus Area]

**Monday, April 20, 2026**


---

## Objective

State the main goal for today.

Example prompts:
- Why the schema is the way it is ?

---
## 🧾 High-Level Topic Summary (DB Only)

The database is extremely minimal — just 3 tables:

* `User`
* `Asset`
* `Order`

At first glance it feels clean, but the more I looked at it, the more I realized:

> This is not a proper trading database. It’s just storing **current state snapshots**, not real financial data.

There is **no history, no audit trail, no proper separation of concepts** like orders, trades, or positions.

---

## 🧩 Core Concepts Learned (DB Focus)

### 1. Snapshot-Based Design

**Definition:**
The DB only stores the *latest state*, not how that state was reached.

**Why it matters here:**

* `Asset` → stores current balance
* `Order` → stores current position-like info

No history means:

* can’t debug issues
* can’t reconstruct trades
* can’t audit money flow

**Example:**
Balance = 800
No idea if:

* user traded ❓
* system bug ❓
* manual update ❓

---

### 2. Missing Ledger (Biggest Gap)

**Definition:**
A ledger records every money movement as an immutable entry.

**Why it matters here:**
This DB directly updates balances instead of recording transactions.

That means:

* no traceability
* no financial correctness
* impossible to verify system integrity

**Example:**

```text
Correct system:
+100 (deposit)
-200 (trade)
= 900

Current system:
balance = 900  ❌ (no explanation)
```

---

### 3. Order Table is Overloaded

**Definition:**
One table is trying to represent multiple concepts.

**Why it matters here:**
`Order` is acting as:

* order request
* executed trade
* position
* pnl tracker

This makes it:

* confusing to reason about
* impossible to scale
* hard to maintain

**Example:**

```text
Real world:
Order → Fill → Position

Here:
Order = everything ❌
```

---

### 4. No Separation of Financial Entities

**Definition:**
A proper system separates concerns into different tables.

**Why it matters here:**
Missing tables:

* trades / executions
* positions
* ledger
* instruments (BTC, ETH, etc.)

Because of this:

* everything is tightly coupled
* system cannot grow beyond basic BTC trading

---

## ⚙️ Table-Level Observations

### 👤 User

* Basic identity table
* ⚠️ Password handling is unsafe (if plain text)

---

### 💰 Asset

* Stores `(userId, symbol, balance)`
* Works like a wallet snapshot

**Problem:**

* No transaction history
* Balance is overwritten directly

---

### 📉 Order

* Stores:

  * entry price
  * exit price
  * qty
  * pnl
  * status

**Problem:**

* mixing order + position + pnl
* no execution tracking
* no lifecycle clarity

---

## 🧠 Key Realization

This DB is:

* ✔ simple
* ✔ easy to build
* ❌ not reliable
* ❌ not auditable
* ❌ not production-safe

> It answers: “What is the state right now?”
> It cannot answer: “How did we get here?”

---

## 🧨 What’s Missing (In One Shot)

A real trading DB would include:

* Ledger (money movement)
* Orders (requests)
* Fills (executions)
* Positions (open exposure)
* Instruments (BTC, ETH, etc.)

---

## 📝 Final Thought

The current design works only because:

> the **engine holds the real logic**, and DB is just a storage dump.

If DB had to stand alone,
this system would **fall apart immediately**.
