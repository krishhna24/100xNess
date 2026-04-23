# Day 4 Learnings

## Balance Endpoints

Three endpoints, all behind `isAuth` middleware:

| Route | Method | What |
|---|---|---|
| `/balance` | GET | All assets for user |
| `/balance/:symbol` | GET | Single asset by symbol |
| `/balance/deposit` | POST | Upsert asset, increment balance |

**Key patterns:**

- Zod `safeParse` on params/body before touching DB
- Prisma `upsert` with `userId_symbol` composite unique key — creates if missing, increments if exists
- Amounts stored as **base units** (integer): `amount * 10^decimals` — avoids float precision bugs
- `decimals` defaults: USDC=2, BTC=8

```ts
const baseUnitAmount = Math.round(amount * Math.pow(10, decimalPlaces));
// upsert: create with balance or increment existing
```

---

## Foundations of Pub-Sub

**One sentence:** Publishers emit events to a topic; subscribers receive them — neither side knows about the other.

### vs Other Patterns

| Pattern | Shape | Best For |
|---|---|---|
| Request-response | 1→1 | Immediate replies |
| Queue | 1→1 consumer | Background jobs (done once) |
| Pub-Sub | 1→N | Event fan-out, reactive systems |

Queue = work sharing (one handler). Pub-Sub = event broadcast (many handlers).

### Three Decouplings

1. **Spatial** — publisher doesn't know consumer address
2. **Temporal** — don't need to be online simultaneously (durable brokers)
3. **Synchronization** — publisher doesn't block on consumer processing

### Core Components

`Publisher → Topic → Broker → [Subscriber A, B, C]`

### Good Fit
- One event triggers multiple reactions
- Consumers added over time without changing publisher
- Async processing, auditability, replay needed

### Bad Fit
- Caller needs immediate reply
- Exactly one worker should handle task
- Simple synchronous workflow

### What Pub-Sub Doesn't Give for Free
Guaranteed delivery, ordering, easy debugging — these come from explicit choices: partitions, retention, acknowledgments, idempotent consumers.

> Decoupling is the real value. The event is just the vehicle.

### Common Pitfalls
- Treating it like sync RPC
- Assuming delivery is guaranteed by default
- Forgetting duplicate delivery is common
- Poor event schemas
