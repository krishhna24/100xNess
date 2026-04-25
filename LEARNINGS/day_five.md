# Day 5 Learnings



**Friday, April 25, 2026**



---



## Redis Streams & The Pub-Sub Bridge Pattern



Today's focus: implementing pub-sub between `api-service` and `engine-service` using Redis Streams, and the key pattern that makes async messaging feel synchronous to the HTTP caller.



---



## Why Not Plain Redis Pub/Sub?



Redis has a built-in `PUBLISH`/`SUBSCRIBE` command. So why use Streams (`XADD`/`XREAD`)?



| Feature | `PUBLISH`/`SUBSCRIBE` | Redis Streams |

|---|---|---|

| Message persistence | No — fire and forget | Yes — messages stored in log |

| Consumer missed message | Gone forever | Can re-read from any offset |

| Consumer groups | No | Yes |

| Message ID / ordering | No | Yes (auto-generated `id`) |

| Replay/audit | No | Yes |



For a trading engine, losing a message = losing a trade. Streams give durability.



---



## Redis Streams Core Concepts



### `XADD` — Publishing



```bash

XADD stream-name * field1 value1 field2 value2

```



- `*` → auto-generate message ID (e.g., `1714000000000-0`)

- ID format: `<milliseconds>-<sequence>`

- Returns the generated ID



### `XREAD` — Consuming



```bash

XREAD BLOCK 0 STREAMS stream-name $

```



- `BLOCK 0` → block the connection forever until a message arrives (long-poll)

- `$` → only messages arriving *after* this command runs (not history)

- Returns: array of `[streamName, [[id, [field, value, ...]], ...]]`



### The `$` vs `0` offset



| Offset | Meaning |

|---|---|

| `$` | Only new messages from now |

| `0` | All messages from the beginning |

| `<id>` | All messages after that specific ID |



Use `$` on startup when you only care about new events, not history.



---



## The Correlation ID Pattern



This is the core insight of today's `RedisSubscriber`.



**Problem:** HTTP is synchronous. The client calls `POST /trade` and expects a response. But the engine is a separate process — it processes asynchronously. How do you bridge them?



**Solution: Correlation ID (callback ID)**



```

HTTP Client

    │

    ▼

api-service

    │  1. generate unique callbackId (e.g. UUID)

    │  2. register callback: callbacks[callbackId] = resolve

    │  3. XADD order-queue  { ...orderData, callbackId }

    │  4. await waitForMessage(callbackId)  ← Promise hangs here

    │

    ▼

engine-service

    │  5. XREAD order-queue

    │  6. process the order

    │  7. XADD callback-queue  { result, id: callbackId }

    │

    ▼

api-service (RedisSubscriber loop)

    │  8. XREAD callback-queue picks up message

    │  9. find callbacks[callbackId]

    │  10. call fn(data)  →  Promise resolves

    │

    ▼

HTTP Client gets response

```



The `callbackId` is the correlation key. It ties the async reply back to the specific HTTP request that's waiting for it.



---



## The `RedisSubscriber` Class Walkthrough



```ts

// Singleton loop — runs forever in the background

async runLoop() {

    while (true) {

        const response = await this.client.xread(

            "BLOCK", 0,       // block until a message arrives

            "STREAMS",

            CALLBACK_QUEUE,   // "callback-queue"

            "$"               // only new messages

        );

        // ...parse fields and invoke callback...

    }

}

```



**Key: one Redis connection, one loop** handles ALL pending requests. It's not one loop per HTTP request. This is efficient — no polling, no timers, the OS wakes the process when Redis delivers a message.



```ts

waitForMessage(callbackId: string) {

    return new Promise<Record<string, string>>((resolve, reject) => {

        const timer = setTimeout(() => {

            delete this.callbacks[callbackId];

            reject(new Error("Timeout waiting for message"));

        }, 5000);



        this.callbacks[callbackId] = (data) => {

            clearTimeout(timer);

            resolve(data);

        };

    });

}

```



**What this does:**

1. Returns a Promise that the controller can `await`

2. Registers a callback in `this.callbacks` map (keyed by `callbackId`)

3. Sets a 5-second timeout — if engine never replies, the Promise rejects instead of hanging forever

4. When `runLoop` receives a message with matching `callbackId`, it calls this fn → Promise resolves



---



## Field Parsing — Why the Loop



Redis Streams store fields as a flat array: `[key1, val1, key2, val2, ...]`



```ts

const fields = rawFields as string[];

const data: Record<string, string> = {};

for (let i = 0; i < fields.length; i += 2)

    data[fields[i]!] = fields[i + 1]!;

```



ioredis returns raw array, not an object. You rebuild the key-value map manually. `i += 2` because keys and values alternate.



---



## Connection Isolation Rule



`XREAD BLOCK` holds a Redis connection open. A blocked connection **cannot run other commands**.



This is why `RedisSubscriber` uses its own dedicated `Redis` instance:



```ts

// ✅ correct — dedicated connection for blocking read

this.client = new Redis({ host, port });

```



Never share this connection with the rest of the app. Other code (queries, writes) needs its own connection or it will be blocked.



---



## Timeout Design



5 seconds chosen because:

- Engine should respond in milliseconds

- 5s covers transient network lag without hanging the HTTP connection forever

- Too short = false timeouts; too long = bad UX on engine crash



In production you'd make this configurable and add metrics on timeout rate.



---



## The Full Flow in This System



```

HTTP POST /trade

    │

    ├─ api-service: XADD order-queue  { userId, symbol, qty, callbackId }

    ├─ api-service: await waitForMessage(callbackId)

    │

    │            [engine-service]

    │            XREAD order-queue

    │            match order, update DB

    │            XADD callback-queue  { status, orderId, id: callbackId }

    │

    ├─ RedisSubscriber loop wakes up

    ├─ finds callbacks[callbackId]

    ├─ resolves Promise

    │

    └─ HTTP response sent to client

```



---



## Key Takeaways



1. **Redis Streams > plain pub/sub** for trading — persistence protects against message loss.

2. **Correlation ID pattern** bridges sync HTTP and async messaging cleanly.

3. **One blocking loop, many pending Promises** — efficient; no per-request connections.

4. **Dedicated Redis connection for XREAD BLOCK** — never share with non-blocking operations.

5. **Always add timeout** to `waitForMessage` — never let an HTTP request hang indefinitely on engine failure.



---



> The `RedisSubscriber` is not pub-sub in the traditional sense — it's request-response *disguised* as pub-sub via correlation IDs. The pattern is the same one used by Kafka, RabbitMQ reply-to queues, and gRPC over message queues.
