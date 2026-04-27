import { Order } from "@repo/types";

type UserBalances = Record<string, number>;

export const state = {
    open_orders: [] as Order[],
    balances: {} as Record<string, UserBalances>,
    prices: {} as Record<string, number>,
    bidPrices: {} as Record<string, number>,
    askPrices: {} as Record<string, number>,
    lastId: "$",
};
