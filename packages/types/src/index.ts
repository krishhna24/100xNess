export type Symbol = "USDC" | "BTC";
export type Side = "long" | "short";
export type OrderStatus = "open" | "closed";
export type CloseReason = "TakeProfit" | "StopLoss" | "Manual" | "Liquidation";

export interface Order {
    id: string;
    userId: string;
    asset: string;
    side: "long" | "short";
    qty: number;
    leverage?: number;
    openingPrice: number;
    createdAt: number;
    status: string;
    takeProfit?: number;
    stopLoss?: number;
}

export interface UserBalance {
    symbol: Symbol;
    balance: number;
    decimals: number;
}

export interface PriceData {
    symbol: string;
    bid: number;
    ask: number;
    timestamp: number;
}

export type EngineMessageKind =
    | "create-order"
    | "close-order"
    | "price-update"
    | "balance-update";

export interface BalanceAsset {
    symbol: string;
    balance: number;
    decimals: number;
}

export interface CreateOrderPayload {
    id: string;
    userId: string;
    asset: string;
    side: Side;
    qty: number;
    leverage: number;
    takeProfit?: number;
    stopLoss?: number;
    balanceSnapshot: BalanceAsset[];
    enqueuedAt: number;
}

export interface CloseOrderPayload {
    orderId: string;
    userId: string;
    closeReason: CloseReason;
    pnl?: number;
    closedAt: number;
}

export interface PriceUpdatePayload {
    s: string;
    b: number;
    a: number;
}

export interface BalanceUpdatePayload {
    userId: string;
    symbol: Symbol;
    newBalance: number;
    decimals: number;
}

export type EngineMessage =
    | { kind: "create-order"; payload: CreateOrderPayload }
    | { kind: "close-order"; payload: CloseOrderPayload }
    | { kind: "price-update"; payload: PriceUpdatePayload }
    | { kind: "balance-update"; payload: BalanceUpdatePayload };

export type CallbackStatus =
    | "created"
    | "closed"
    | "insufficient_balance"
    | "no_price"
    | "invalid_order";

export interface CallbackMessage {
    id: string;
    status: CallbackStatus;
    reason?: CloseReason;
    pnl?: number;
}

export const STREAMS = {
    ENGINE: "engine-stream",
    CALLBACK: "callback-queue",
} as const;
