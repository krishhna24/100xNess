import express, { Router } from "express";
import { depositBalance, getBalance, getBalanceByAsset } from "../controllers/balance.controller";
import { isAuth } from "../middlewares/auth";

export const balanceRouter: Router = express.Router();

balanceRouter.use(isAuth);

balanceRouter.get("/", getBalance);
balanceRouter.get("/:symbol", getBalanceByAsset);
balanceRouter.post("/deposit", depositBalance);
