import { Order, CreateOrderPayload, CloseOrderPayload, CloseReason } from "@repo/types";
import { prisma } from "@repo/db";
import { state } from "./state";
import { client } from "./client";
import { CALLBACK_QUEUE } from "./constants";
import { getMemBalance, setMemBalance, updateToDB } from "./balance";
import { processOrderLiquidation } from "./liquidation";
import { safeNum } from "./utils";

export async function handlePriceUpdate(payload: unknown) {
    const p = payload as Record<string, unknown> | null | undefined;
    const data = (p?.data ?? payload) as Record<string, unknown> | null | undefined;
    if (!data?.s) return;

    const rawSymbol = typeof data.s === "string" && data.s.endsWith("_USDC")
        ? data.s.replace("_USDC", "")
        : data.s;
    const symbol = String(rawSymbol).toUpperCase();
    const bidPrice = safeNum(data.b, 0);
    const askPrice = safeNum(data.a, 0);

    if (bidPrice <= 0 || askPrice <= 0) return;

    state.prices[symbol] = (bidPrice + askPrice) / 2;
    state.bidPrices[symbol] = bidPrice;
    state.askPrices[symbol] = askPrice;
    console.log(
        `[ENGINE] Price updated: ${symbol} = ${state.prices[symbol]!.toFixed(2)} (bid ${bidPrice.toFixed(2)}, ask ${askPrice.toFixed(2)})`
    );

    for (let i = state.open_orders.length - 1; i >= 0; i--) {
        const order = state.open_orders[i];
        if (!order || order.asset !== symbol) continue;

        const curr = order.side === "long" ? bidPrice : askPrice;
        const result = await processOrderLiquidation(order, curr, "price-update");
        if (result.liquidated) state.open_orders.splice(i, 1);
    }
}

export async function handleCreateOrder(payload: CreateOrderPayload) {
    console.log(`[ENGINE] Processing create-order:`, payload);
    const { id: orderId, userId, asset: rawAsset, side, qty, leverage, balanceSnapshot, takeProfit, stopLoss } = payload;

    const asset = rawAsset ? String(rawAsset).toUpperCase() : "";
    const q = safeNum(qty, NaN);
    const lev = safeNum(leverage, 1);

    if (!userId || !asset || !side || !orderId || !Number.isFinite(q) || q <= 0) {
        console.log("missing/invalid fields", { orderId, userId, asset, q, side });
        await client
            .xadd(CALLBACK_QUEUE, "*", "id", orderId || "unknown", "status", "invalid_order")
            .catch(err => console.error("Failed to send invalid_order:", err));
        return;
    }

    if (state.open_orders.some(o => o.id === orderId)) {
        console.log(`[ENGINE] Duplicate create-order ${orderId} ignored`);
        await client
            .xadd(CALLBACK_QUEUE, "*", "id", orderId, "status", "created")
            .catch(err => console.error("Failed to send created callback:", err));
        return;
    }

    const bidPrice = state.bidPrices[asset];
    const askPrice = state.askPrices[asset];
    if (!bidPrice || !askPrice) {
        console.log("no price available", { orderId, asset, availablePrices: Object.keys(state.bidPrices) });
        await client
            .xadd(CALLBACK_QUEUE, "*", "id", orderId, "status", "no_price")
            .catch(err => console.error("Failed to send no_price:", err));
        return;
    }

    const openingPrice = side === "long" ? askPrice : bidPrice;
    const requiredMargin = (openingPrice * q) / (lev || 1);
    const usdc = getMemBalance(userId, "USDC", balanceSnapshot) ?? 0;

    console.log(`[ENGINE] Balance check for order ${orderId}:`, {
        userId,
        usdc,
        requiredMargin,
        openingPrice,
        qty: q,
        leverage: lev,
        hasEnoughBalance: usdc >= requiredMargin,
    });

    if (usdc < requiredMargin) {
        console.log("Insufficient balance", { orderId, userId, requiredMargin, usdc });
        await client
            .xadd(CALLBACK_QUEUE, "*", "id", orderId, "status", "insufficient_balance")
            .catch(err => console.error("Failed to send insufficient_balance:", err));
        return;
    }

    const newBal = setMemBalance(userId, "USDC", usdc - requiredMargin);
    await updateToDB(userId, "USDC", newBal);

    const order: Order = {
        id: orderId,
        userId,
        asset,
        side,
        qty: q,
        leverage: lev || 1,
        openingPrice,
        createdAt: Date.now(),
        status: "open",
        takeProfit:
            takeProfit != null && Number.isFinite(Number(takeProfit)) && Number(takeProfit) > 0
                ? Number(takeProfit)
                : undefined,
        stopLoss:
            stopLoss != null && Number.isFinite(Number(stopLoss)) && Number(stopLoss) > 0
                ? Number(stopLoss)
                : undefined,
    };

    state.open_orders.push(order);
    console.log(`Order created: ${orderId} for user ${userId}`, {
        side: order.side,
        qty: order.qty,
        openingPrice: order.openingPrice,
        leverage: order.leverage,
        takeProfit: order.takeProfit ?? "not set",
        stopLoss: order.stopLoss ?? "not set",
        createdAt: new Date(order.createdAt).toISOString(),
    });

    await client
        .xadd(CALLBACK_QUEUE, "*", "id", orderId, "status", "created")
        .catch(err => console.error("Failed to send created callback:", err));
}

export async function handleCloseOrder(payload: CloseOrderPayload) {
    console.log(`[ENGINE] Processing close-order:`, payload);
    const { orderId, userId, closeReason, pnl } = payload;

    if (!orderId || !userId) {
        await client
            .xadd(CALLBACK_QUEUE, "*", "id", orderId || "unknown", "status", "invalid_close_request")
            .catch(err => console.error("Failed to send invalid_close_request:", err));
        return;
    }

    const idx = state.open_orders.findIndex(o => o.id === orderId && o.userId === userId);
    if (idx === -1) {
        await client
            .xadd(CALLBACK_QUEUE, "*", "id", orderId, "status", "order_not_found")
            .catch(err => console.error("Failed to send order_not_found:", err));
        return;
    }

    const order = state.open_orders[idx]!;
    let finalPnl: number = Number.isFinite(Number(pnl)) ? Number(pnl) : 0;
    let closingPrice = 0;

    if (!Number.isFinite(Number(pnl))) {
        const currentBidPrice = state.bidPrices[order.asset];
        const currentAskPrice = state.askPrices[order.asset];

        if (currentBidPrice && currentAskPrice) {
            closingPrice = order.side === "long" ? currentBidPrice : currentAskPrice;
            finalPnl =
                order.side === "long"
                    ? (closingPrice - order.openingPrice) * order.qty
                    : (order.openingPrice - closingPrice) * order.qty;
        } else {
            closingPrice = order.openingPrice;
            finalPnl = 0;
            console.log(`No price available for ${order.asset} when closing order ${order.id}, using opening price`);
        }
    }

    if (!state.balances[userId]) state.balances[userId] = {};
    const initialMargin = (order.openingPrice * order.qty) / (order.leverage || 1);
    const newBal = setMemBalance(userId, "USDC", (state.balances[userId].USDC || 0) + initialMargin + finalPnl);
    await updateToDB(userId, "USDC", newBal);

    try {
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: "closed",
                pnl: Math.round(finalPnl * 10000),
                closingPrice: Math.round((closingPrice || order.openingPrice) * 10000),
                closedAt: new Date(),
                closeReason: (closeReason ?? "Manual") as CloseReason,
            },
        });
        state.open_orders.splice(idx, 1);
    } catch (e) {
        console.log("error on manual closing", e);
        return;
    }

    await client
        .xadd(
            CALLBACK_QUEUE,
            "*",
            "id", orderId,
            "status", "closed",
            "reason", closeReason || "Manual",
            "pnl", String(finalPnl)
        )
        .catch(err => console.error("Failed to send close success callback:", err));
}
