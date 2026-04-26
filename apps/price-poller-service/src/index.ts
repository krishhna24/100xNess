import { configDotenv } from "dotenv";
import { WebSocket } from "ws";
import { redis } from "@repo/redis";

configDotenv();

const url = "wss://ws.backpack.exchange";
const ws = new WebSocket(url);

console.log("Starting price poller service at 3003");

redis.on("connect", () => {
    console.log("Connected to redis");
});

redis.on("error", (err) => {
    console.log("Error in price poller service: ", err);
})

ws.on("open", () => {
    const subscribeMessage = {
        method: "SUBSCRIBE",
        params: ["bookTicker.BTC_USDC"],
        id: 1,
    };
    ws.send(JSON.stringify(subscribeMessage));
});

ws.on("message", async (message) => {
    try {
        const data = JSON.parse(message.toString());
        await redis.xadd(
            "engine-stream",
            "*",
            "data",
            JSON.stringify({ kind: "price-update", payload: data })
        );
    } catch (e) {
        console.log(e);
    }
});
