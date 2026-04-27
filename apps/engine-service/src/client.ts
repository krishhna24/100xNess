import { redis } from "@repo/redis";

export const client: ReturnType<typeof redis.duplicate> = redis.duplicate();
