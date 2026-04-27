import { prisma } from "@repo/db";
import { state } from "./state";
import { checkLiquidations } from "./liquidation";

export async function createSnapshot() {
    try {
        for (const order of state.open_orders) {
            const currentBidPrice = state.bidPrices[order.asset];
            const currentAskPrice = state.askPrices[order.asset];
            if (!currentAskPrice || !currentBidPrice) continue;

            const currentPriceForOrder = order.side === "long" ? currentBidPrice : currentAskPrice;
            const currentPnl = order.side === "long"
                ? (currentPriceForOrder - order.openingPrice) * order.qty
                : (order.openingPrice - currentPriceForOrder) * order.qty;

            const margin = Math.round((order.openingPrice * order.qty * 100) / (order.leverage || 1));

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
                    margin,
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
                    margin,
                    createdAt: new Date(order.createdAt),
                } as any,
            });
        }

        await checkLiquidations();
        console.log("Snapshot sent");
    } catch (err) {
        console.error("Error in createSnapshot in engine: ", err);
    }
}

export async function loadSnapshot() {
    try {
        const dbOrders = await prisma.order.findMany({ where: { status: "open" } });

        state.open_orders = dbOrders.map((order: any) => ({
            id: order.id,
            userId: order.userId,
            asset: "BTC",
            side: order.side as "long" | "short",
            qty: order.qty / 100,
            leverage: order.leverage,
            openingPrice: order.openingPrice / 10000,
            createdAt: order.createdAt.getTime(),
            status: "open",
            takeProfit: order.takeProfit && order.takeProfit > 0 ? order.takeProfit / 10000 : undefined,
            stopLoss: order.stopLoss && order.stopLoss > 0 ? order.stopLoss / 10000 : undefined,
        }));

        console.log(`loaded ${state.open_orders.length} open orders from the database`);
        console.log("Order IDs loaded:", state.open_orders.map(o => `${o.id.slice(0, 8)}...`));

        state.balances = {};
    } catch (err) {
        console.log("Error in loadSnapshot in engine: ", err);
    }
}
