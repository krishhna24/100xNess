import { prisma } from "@repo/db";
import { Request, Response } from "express";
import { redis } from "@repo/redis";
import { RedisSubscriber } from "../redisSubscriber";
import { randomUUID } from "crypto";
import { CloseOrderBodySchema, CreateOrderBodySchema } from "../schemas/trade.type";

const subscriber = new RedisSubscriber();

const addToStream = async (id: string, request: unknown) => {
    await redis.xadd("engine-stream", "*", "data", JSON.stringify({ id, request }))
}

export async function sendRequestAndWait(id: string, request: unknown) {
    const waitPromise = subscriber.waitForMessage(id);
    try {
        await addToStream(id, request);
    } catch (err) {
        subscriber.cancelWait(id);
        throw err;
    }
    return waitPromise;
}

export const getOrders = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Unauthorized" });
        }

        const orders = await prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        const transformed = orders.map((order: any) => ({
            id: order.id,
            symbol: "BTC",
            orderType: order.side,
            quantity: order.qty / 100,
            price: order.openingPrice / 10000,
            status: order.status,
            pnl: order.pnl / 10000,
            createdAt: order.createdAt.toISOString(),
            closedAt: order.closedAt?.toISOString(),
            exitPrice: order.closingPrice ? order.closingPrice / 10000 : undefined,
            leverage: order.leverage,
            takeProfit: order.takeProfit ? order.takeProfit / 10000 : undefined,
            stopLoss: order.stopLoss ? order.stopLoss / 10000 : undefined,
            closeReason: order.closeReason,
        }));

        res.status(200).json({ success: true, orders: transformed });

    } catch (err) {
        console.error("ERROR in getOrders: ", err)
        res.status(500).json({ error: "Internal server error" });
    }
}

export const getOrderById = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Unauthorized" });
        }

        const orderId = req.params.orderId as string;

        const order = await prisma.order.findFirst({
            where: { id: orderId, userId },
        })
        if (!order) return res.status(404).json({ success: false, error: "Order not found" });

        res.status(200).json({
            success: true, order: {
                id: order.id,
                symbol: "BTC",
                orderType: order.side,
                quantity: Number(order.qty) / 100,
                price: Number(order.openingPrice) / 10000,
                status: order.status,
                pnl: Number(order.pnl) / 10000,
                createdAt: order.createdAt.toISOString(),
                closedAt: order.closedAt?.toISOString(),
                leverage: order.leverage,
            }
        })

    } catch (err) {
        console.error("Error in getOrderById: ", err);
        res.status(500).json({ error: "Internal server error" });
    }
}

const getBalance = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { assets: { select: { symbol: true, balance: true, decimals: true } } },
    })
    return user?.assets || [];
}

export const createOrder = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Unauthorized" });
        }

        const result = CreateOrderBodySchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ success: false, message: "Validation failure" });
        }

        const { asset, side, qty, leverage, takeProfit, stopLoss } = result.data;
        const id = randomUUID();
        const balanceSnapshot = await getBalance(userId);

        const payload = {
            kind: "create-order",
            payload: {
                id,
                userId,
                asset,
                side,
                status: "open",
                qty: Number(qty),
                leverage: Number(leverage),
                takeProfit: takeProfit != null ? Number(takeProfit) : null,
                stopLoss: stopLoss != null ? Number(stopLoss) : null,
                balanceSnapshot,
                enqueuedAt: Date.now(),
            },
        }

        const callback = await sendRequestAndWait(id, payload);

        if (callback.status === "insufficient_balance")
            return res.status(400).json({ error: "Insufficient balance" });

        if (callback.status === "no_price")
            return res.status(400).json({ error: "Price not available" });

        if (callback.status !== "created")
            return res.status(400).json({ error: `Order failed: ${callback.status}` });

        res.status(200).json({ message: "Order created", orderId: id });

    } catch (err) {
        console.error("Error in createOrder: ", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const closeOrder = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Unauthorized" });
        }

        const orderId = req.params.orderId as string;

        const result = CloseOrderBodySchema.safeParse(req.body);
        if (!result.success) return res.status(400).json({ error: result.error.message });

        const { pnl, closeReason = "Manual" } = result.data;

        const existing = await prisma.order.findFirst({
            where: { id: orderId, userId, status: "open" },
        });

        if (!existing)
            return res.status(404).json({ error: "Order not found or already closed" });

        const payload = {
            kind: "close-order",
            payload: {
                orderId,
                userId,
                closeReason,
                pnl: pnl ? Number(pnl) : undefined,
                closedAt: Date.now(),
            },
        };

        const callback = await sendRequestAndWait(orderId, payload);

        if (callback.status === "order_not_found")
            return res.status(404).json({ error: "Order not found in engine" });

        if (callback.status === "invalid_close_request")
            return res.status(400).json({ error: "Invalid close request" });

        if (callback.status !== "closed")
            return res.status(400).json({ error: `Close failed: ${callback.status}` });

        res.json({ message: "Order closed successfully", orderId });

    } catch (err) {
        console.error("Error in closeOrder: ", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}
