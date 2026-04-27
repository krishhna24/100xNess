import express from "express"
import { configDotenv } from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser";
import { router } from "./routes";
import { redis } from "@repo/redis";

configDotenv();

redis.connect().catch((err) => {
    console.error("[redis] failed to connect:", err.message);
    process.exit(1);
});

const app = express();

const PORT = process.env.PORT || 4000;

app.use(
    cors({
        origin: "http://localhost:3000",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Cookie",
            "X-Requested-With",
        ],
    })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api", router);

app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`API Service running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});
