import Redis from "ioredis";

function createRedisClient() {
    const client = new Redis({
        host: process.env.REDIS_HOST ?? "127.0.0.1",
        port: Number(process.env.REDIS_PORT ?? 6379),
        maxRetriesPerRequest: null,
        lazyConnect: true,
    });

    client.on("error", (err) => {
        console.error("[redis] connection error:", err.message);
    });

    return client;
}

export const redis = createRedisClient();

export type RedisClient = typeof redis;
