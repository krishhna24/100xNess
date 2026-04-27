import { prisma, Symbol } from "@repo/db";
import { state } from "./state";

export async function updateToDB(userId: string, symbol: string, newBalance: number) {
    try {
        await prisma.asset.upsert({
            where: { userId_symbol: { userId, symbol: symbol as Symbol } },
            create: {
                userId,
                symbol: symbol as Symbol,
                balance: Math.round(newBalance * 100),
                decimals: 2,
            },
            update: { balance: Math.round(newBalance * 100) },
        });
        console.log(`Updated ${symbol} balance for ${userId}: ${newBalance}`);
    } catch (error) {
        console.error(`Failed to update balance for ${userId}:`, error);
    }
}

export function getMemBalance(
    userId: string,
    symbol: string,
    snapshot?: Array<{ symbol: string; balance: number; decimals: number }>
): number {
    if (!state.balances[userId]) state.balances[userId] = {};

    if (snapshot) {
        const snap = snapshot.find(a => a.symbol === symbol);
        if (snap) {
            const val = snap.balance / 10 ** (snap.decimals ?? 2);
            state.balances[userId][symbol] = val;
            return val;
        }
    }

    if (state.balances[userId][symbol] == null) state.balances[userId][symbol] = 0;
    return state.balances[userId][symbol]!;
}

export function setMemBalance(userId: string, symbol: string, newVal: number): number {
    if (!state.balances[userId]) state.balances[userId] = {};
    state.balances[userId][symbol] = newVal;
    return newVal;
}
