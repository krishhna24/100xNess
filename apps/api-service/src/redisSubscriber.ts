import Redis from "ioredis";

export const CALLBACK_QUEUE = 'callback-queue'

interface CallbackEntry {
    resolve: (data: Record<string, string>) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class RedisSubscriber {
    private client: Redis;
    private callbacks: Record<string, CallbackEntry>;

    constructor() {
        const host = process.env.REDIS_HOST || '127.0.0.1';
        const port = Number(process.env.REDIS_PORT || 6379);
        this.client = new Redis({ host, port });
        this.callbacks = {};
        this.runLoop();
    }

    async runLoop() {
        while (true) {
            try {
                const response = await this.client.xread(
                    "BLOCK",
                    0,
                    "STREAMS",
                    CALLBACK_QUEUE,
                    "$"
                );
                if (!response || response.length === 0) continue;

                const [, messages] = response[0]!;
                if (!messages || messages.length === 0) continue;

                for (const [, rawFields] of messages) {
                    const fields = rawFields as string[];
                    const data: Record<string, string> = {};
                    for (let i = 0; i < fields.length; i += 2)
                        data[fields[i]!] = fields[i + 1]!;

                    const callbackId = data.id;
                    console.log(`[SUBSCRIBER] Received callback:`, data);

                    const entry = callbackId ? this.callbacks[callbackId] : undefined;
                    if (entry) {
                        clearTimeout(entry.timer);
                        entry.resolve(data);
                        delete this.callbacks[callbackId!];
                    }
                }
            } catch (err) {
                console.error(`[SUBSCRIBER] xread error:`, err);
            }
        }
    }

    waitForMessage(callbackId: string) {
        return new Promise<Record<string, string>>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.callbacks[callbackId]) {
                    delete this.callbacks[callbackId];
                    reject(new Error("Timeout waiting for engine response"));
                }
            }, 5000);

            this.callbacks[callbackId] = { resolve, reject, timer };
        });
    }

    cancelWait(callbackId: string) {
        const entry = this.callbacks[callbackId];
        if (entry) {
            clearTimeout(entry.timer);
            entry.reject(new Error("Stream publish failed"));
            delete this.callbacks[callbackId];
        }
    }
}
