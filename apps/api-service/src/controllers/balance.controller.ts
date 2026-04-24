import { prisma } from "@repo/db";
import { Request, Response } from "express";
import { DepositBalanceBodySchema, GetBalanceByAssetParamsSchema } from "../schemas/balance.type";
import { redis } from "@repo/redis";

export const getBalance = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const balances = await prisma.asset.findMany({
            where: { userId },
            select: {
                symbol: true,
                balance: true,
                decimals: true
            }
        });
        res.json({ userId, balances });

    } catch (err) {
        console.error("Error in getBalance endpoint: ", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

export const getBalanceByAsset = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const result = GetBalanceByAssetParamsSchema.safeParse(req.params);

        if (!result.success) {
            return res.status(400).json({ success: false, message: "Validation failure" });
        }

        const { symbol } = result.data;

        const record = await prisma.asset.findUnique({
            where: {
                userId_symbol: {
                    userId: userId,
                    symbol: symbol
                }
            },
            select: {
                symbol: true,
                balance: true,
                decimals: true
            }
        });

        if (!record) {
            return res.status(404).json({ success: false, message: "Asset not found" });
        }

        res.json(record);

    } catch (err) {
        console.error("Error in getBalanceByAsset endpoint: ", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}


export const depositBalance = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const result = DepositBalanceBodySchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ success: false, message: "Validation failure" });
        }

        const { symbol, amount, decimals } = result.data;

        const validSymbols = ['USDC', 'BTC'];
        if (!validSymbols.includes(symbol)) {
            return res.status(400).json({
                error: "Invalid symbol",
                validSymbols: validSymbols
            });
        }

        const decimalPlaces = decimals ?? (symbol === 'USDC' ? 2 : 8);
        const baseUnitAmount = Math.round(amount * Math.pow(10, decimalPlaces));

        const updated = await prisma.asset.upsert({
            where: {
                userId_symbol: {
                    userId: userId,
                    symbol: symbol
                }
            },
            create: {
                userId,
                symbol,
                balance: baseUnitAmount,
                decimals: decimalPlaces
            },
            update: {
                balance: { increment: baseUnitAmount },
            },
            select: {
                symbol: true,
                balance: true,
                decimals: true
            }
        });

        await redis.xadd(
            "engine-stream",
            "*",
            "data",
            JSON.stringify({
                kind: "balance-update",
                payload: {
                    userId,
                    symbol,
                    newBalance: updated.balance,
                    decimals: updated.decimals
                }
            })
        )

        res.json({ success: true, asset: updated });

    } catch (err) {
        console.error("Error in depositBalance endpoint: ", err);
        res.status(500).json({ success: false, message: "Internal server error" });

    }
}
