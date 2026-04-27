import { Order } from "@repo/types";
import { prisma } from "@repo/db";
import { state } from "./state";
import { client } from "./client";
import { CALLBACK_QUEUE } from "./constants";
import { setMemBalance, updateToDB } from "./balance";

export async function processOrderLiquidation(
    order: Order,
    currentPriceForOrder: number,
    context = "price-update"
): Promise<{ liquidated: boolean; pnl: number; reason?: string }> {
    if (!currentPriceForOrder || !Number.isFinite(currentPriceForOrder) || currentPriceForOrder <= 0) {
        console.log(`${context}: Invalid price for order ${order.id}, skipping liquidation check`);
        return { liquidated: false, pnl: 0 };
    }

    const pnl =
        order.side === "long"
            ? (currentPriceForOrder - order.openingPrice) * order.qty
            : (order.openingPrice - currentPriceForOrder) * order.qty;

    if (!Number.isFinite(pnl)) return { liquidated: false, pnl: 0 };

    let reason: "TakeProfit" | "StopLoss" | "margin" | undefined;

    if (!reason && order.takeProfit && order.takeProfit > 0) {
        const hit =
            order.side === "long"
                ? currentPriceForOrder >= order.takeProfit
                : currentPriceForOrder <= order.takeProfit;
        if (hit) {
            reason = "TakeProfit";
            console.log(
                `${context}: Take profit hit for order ${order.id} (${order.side}): price ${currentPriceForOrder} vs TP ${order.takeProfit}`
            );
        }
    }

    if (!reason && order.stopLoss && order.stopLoss > 0) {
        const hit =
            order.side === "long"
                ? currentPriceForOrder <= order.stopLoss
                : currentPriceForOrder >= order.stopLoss;
        if (hit) {
            reason = "StopLoss";
            console.log(
                `${context}: Stop loss hit for order ${order.id} (${order.side}): price ${currentPriceForOrder} vs SL ${order.stopLoss}`
            );
        }
    }

    if (!reason && order.leverage) {
        const initialMargin = (order.openingPrice * order.qty) / order.leverage;
        const remainingMargin = initialMargin + pnl;
        if (remainingMargin <= initialMargin * 0.05) {
            reason = "margin";
            console.log(
                `${context} liquidation: order ${order.id} liquidated (remaining: ${remainingMargin}, threshold: ${initialMargin * 0.05})`
            );
        }
    }

    if (!reason) return { liquidated: false, pnl };

    if (!state.balances[order.userId]) state.balances[order.userId] = {};

    const initialMargin = (order.openingPrice * order.qty) / (order.leverage || 1);

    if (reason === "margin") {
        const remainingMargin = Math.max(0, initialMargin + pnl);
        const newBalance = setMemBalance(
            order.userId,
            "USDC",
            (state.balances[order.userId]?.USDC || 0) + remainingMargin
        );
        await updateToDB(order.userId, "USDC", newBalance);
        console.log(`Liquidated order ${order.id}: remaining margin = ${remainingMargin}`);
    } else {
        const credit = initialMargin + pnl;
        const newBal = setMemBalance(
            order.userId,
            "USDC",
            (state.balances[order.userId]?.USDC || 0) + credit
        );
        await updateToDB(order.userId, "USDC", newBal);
        console.log(`Closed order ${order.id} (${reason}): returned ${credit}`);
    }

    try {
        await prisma.order.update({
            where: { id: order.id },
            data: {
                status: "closed",
                pnl: Math.round(pnl * 10000),
                closingPrice: Math.round(currentPriceForOrder * 10000),
                closedAt: new Date(),
                closeReason: reason as any,
            },
        });
    } catch (err) {
        console.log(`error on ${context} closing:`, err);
    }

    await client
        .xadd(CALLBACK_QUEUE, "*", "id", order.id, "status", "closed", "reason", reason, "pnl", pnl.toString())
        .catch(err => console.error(`Failed to send ${context} liquidation callback:`, err));

    return { liquidated: true, pnl, reason };
}

export async function checkLiquidations() {
    for (let i = state.open_orders.length - 1; i >= 0; i--) {
        const order = state.open_orders[i];
        if (!order) continue;

        const currentBidPrice = state.bidPrices[order.asset];
        const currentAskPrice = state.askPrices[order.asset];
        if (!currentBidPrice || !currentAskPrice) continue;

        const currentPrice = order.side === "long" ? currentBidPrice : currentAskPrice;
        const result = await processOrderLiquidation(order, currentPrice, "periodic-check");
        if (result.liquidated) state.open_orders.splice(i, 1);
    }
}
