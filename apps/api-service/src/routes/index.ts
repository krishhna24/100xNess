import express, { Router } from "express";
import { balanceRouter } from "./balance.route";
import { tradeRouter } from "./trade.route";
import { authRouter } from "./auth.route";
import { candlesRouter } from "./candles.route";

export const router: Router = express.Router();

router.use("/auth", authRouter);
router.use("/balance", balanceRouter);
router.use("/trade", tradeRouter);
router.use("/candles", candlesRouter);
