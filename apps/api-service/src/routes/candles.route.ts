import express, { Router } from "express"
import { getCandles } from "../controllers/candles.controller";

export const candlesRouter: Router = express.Router();

candlesRouter.get("/", getCandles);
