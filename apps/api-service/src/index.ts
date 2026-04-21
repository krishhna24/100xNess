import express from "express"
import { configDotenv } from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser";

configDotenv();

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

app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`API Service running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});
