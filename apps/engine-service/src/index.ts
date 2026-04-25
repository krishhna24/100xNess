import { Order } from "@repo/types";
import { prisma, Symbol } from "@repo/db";
import { redis } from "@repo/redis"

type UserBalances = Record<string, number>;

let open_orders: Order[] = [];
let balances: Record<string, Record<string, number>> = {};

let prices: Record<string, number> = {};
let bidPrices: Record<string, number> = {};

let askPrices: Record<string, number> = {};

let lastId = "$";

const client = redis.duplicate();

const CALLBACK_QUEUE = "callback-queue";
const ENGINE_STREAM = "engine-stream";

function safeNum(n: any, def = 0) {
    const v = Number(n);

    return Number.isFinite(v) ? v : def;
}

function getFieldValue(fields: string[], key: string) {
    for (let i = 0; i < fields.length; i++) {
        if (fields[i] === key) return fields[i + 1];
    }
    return undefined;
}

async function updateToDB(userId: string, symbol: string, newBalance: number) {
    try {
        await prisma.asset.upsert({
            where: { userId_symbol: { userId, symbol: symbol as Symbol } },
            create: {
                userId,
                symbol: symbol as Symbol,
                balance: Math.round(newBalance * 100),
                decimals: 2
            },
            update: { balance: Math.round(newBalance * 100) }
        })

        console.log(`Updated ${symbol} balance for ${userId}: ${newBalance}`);
    } catch (error) {
        console.error(`Failed to update balance for ${userId}:`, error);
    }
}

function getMemBalance(userId: string, symbol: string, snapshot?: Array<{ symbol: string; balance: number; decimals: number }>) {
    if (!balances[userId]) balances[userId] = {};

    if (snapshot) {
        const snap = snapshot.find(a => a.symbol === symbol);
        if (snap) {
            const decimals = snap.decimals ?? 2;
            const val = snap.balance / 10 ** decimals;
            return val;
        }
    }

}

function setMemBalance(userId: string, symbol: string, newVal: number) {
    if (!balances[userId]) balances[userId] = {};
    balances[userId][symbol] = newVal;
    return newVal;
}

async function createSnapshot() {
    try {
        for (const order of open_orders) {
            const asset = order.asset;
            const currentBidRice = bidPrices.symbol;
            const currentAskPrice = bidPrices.symbol;

            if (!currentAskPrice || !currentBidRice) continue;

            let currentPnl = 0;

            if (currentBidRice && currentAskPrice) {
                const currentPriceForOrder = order.side === "long" ? currentBidRice : currentAskPrice;
                currentPnl = order.side === "long"
                    ? (currentPriceForOrder - order.openingPrice) * order.qty
                    : (order.openingPrice - currentPriceForOrder) * order.qty;
            }

            await prisma.order.upsert({
                where: { id: order.id },
                update: {
                    side: order.side,
                    pnl: Math.round(currentPnl * 10000),
                    decimals: 4,
                    openingPrice: Math.round(order.openingPrice * 10000),
                    closingPrice: 0,
                    status: "open",
                    qty: Math.round(order.qty * 100),
                    qtyDecimals: 2,
                    leverage: order.leverage || 1,
                    takeProfit: order.takeProfit ? Math.round(order.takeProfit * 10000) : null,
                    stopLoss: order.stopLoss ? Math.round(order.stopLoss * 10000) : null,
                    margin: Math.round((order.openingPrice * order.qty * 100) / (order.leverage || 1)),
                },
                create: {
                    id: order.id,
                    userId: order.userId,
                    side: order.side,
                    pnl: Math.round(currentPnl * 10000),
                    decimals: 4,
                    openingPrice: Math.round(order.openingPrice * 10000),
                    closingPrice: 0,
                    status: "open",
                    qty: Math.round(order.qty * 100),
                    qtyDecimals: 2,
                    leverage: order.leverage || 1,
                    takeProfit: order.takeProfit ? Math.round(order.takeProfit * 10000) : null,
                    stopLoss: order.stopLoss ? Math.round(order.stopLoss * 10000) : null,
                    margin: Math.round((order.openingPrice * order.qty * 100) / (order.leverage || 1)),
                    createdAt: new Date(order.createdAt),
                } as any,
            });
        }

        // await checkLiquidations();
        console.log("Snapshot sent");
    } catch (err) {
        console.error("Error in createSnapshot in engine: ", err);
    }
}

async function processOrderLiquidation(
    order: Order,
    currentPriceForOrder: number,
    context: string = "price-update"
) {
    if (!currentPriceForOrder || !Number.isFinite(currentPriceForOrder) || currentPriceForOrder <= 0) {
        console.log(`${context}: Invalid price for order ${order.id}, skipping liquidation check`);
        return { liquidated: false, pnl: 0 }
    }

    const pnl = order.side === 'long'
        ? (currentPriceForOrder - order.openingPrice) * order.qty
        : (order.openingPrice - currentPriceForOrder) * order.qty

    if (!Number.isFinite(pnl))
        return { liquidated: false, pnl: 0 }

    let reason: "TakeProfit" | "StopLoss" | "margin" | undefined

    if (!reason && order.takeProfit && order.takeProfit > 0) {
        const hit = order.side === "long"
            ? currentPriceForOrder >= order.takeProfit
            : currentPriceForOrder <= order.takeProfit
        if (hit) {
            reason = "StopLoss"
            console.log(`${context}: Stop loss hit for order ${order.id} (${order.side}): price ${currentPriceForOrder} vs SL ${order.stopLoss}`);
        }
    }

    if (!reason && order.leverage) {
        const initialMargin = (order.openingPrice * order.qty) / order.leverage;
        const remainingMargin = initialMargin + pnl;
        const liquidationThreshold = initialMargin * 0.05;

        if (remainingMargin <= liquidationThreshold) {
            reason = "margin";
            console.log(`${context} liquidation: order ${order.id} liquidated (remaining: ${remainingMargin}, threshold: ${liquidationThreshold})`);
        }
    }

    if (!reason) return { liquidated: false, pnl };

    if (!balances[order.userId]) balances[order.userId] = {};

    if (reason === 'margin') {
        const initialMargin = (order.openingPrice * order.qty) / (order.leverage || 1);
        const remainingMargin = Math.max(0, initialMargin + pnl);

        const newBalance = setMemBalance(order.userId, "USDC", (balances[order.userId]?.USDC || 0) + remainingMargin);

        await updateToDB(order.userId, "USDC", newBalance)
        console.log(`Liquidated order ${order.id}: remaining margin = ${remainingMargin}`);
    } else {
        const initialMargin = (order.openingPrice * order.qty) / (order.leverage || 1);
        const credit = initialMargin + pnl;
        const newBal = setMemBalance(order.userId, "USDC", (balances[order.userId]?.USDC || 0) + credit);
        await updateToDB(order.userId, "USDC", newBal);
        console.log(`Closed order ${order.id} (${reason}): returned ${credit}`);
    }

    try {
        await prisma.order.update({
            where: { id: order.id },
            data: {
                status: "closed",
                pnl: Math.round(pnl * 1000),
                closingPrice: Math.round(currentPriceForOrder * 10000),
                closedAt: new Date(),
                closeReason: reason as any
            }
        })
    } catch (err) {
        console.log(`error on ${context} closing:`, err);
    }

    await client.xadd(
        CALLBACK_QUEUE,
        "*",
        "id", order.id,
        "status", "closed",
        "reason", reason,
        "pnl", pnl.toString()
    ).catch(err => console.error(`Failed to send ${context} liquidation callback:`, err))

    return { liquidated: true, pnl, reason };

}
