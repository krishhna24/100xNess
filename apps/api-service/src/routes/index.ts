import express, { Router } from "express";
import authRouter from "./auth.route"
import { balanceRouter } from "./balance.route";
import { tradeRouter } from "./trade.route";

const router: Router = express.Router();

router.use("/auth", authRouter);
router.use("/balance", balanceRouter);
router.use("/trade", tradeRouter);
