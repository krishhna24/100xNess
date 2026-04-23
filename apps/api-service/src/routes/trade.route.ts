import express, { Router } from "express";
import { isAuth } from "../middlewares/auth";
import { closeOrder, createOrder, getOrderById, getOrders } from "../controllers/trade.controller";

export const tradeRouter: Router = express.Router();

tradeRouter.use(isAuth);

tradeRouter.post("/open", createOrder);
tradeRouter.post("/close/:orderId", closeOrder);
tradeRouter.get("/orders", getOrders);
tradeRouter.get("/orders/:orderId", getOrderById);
