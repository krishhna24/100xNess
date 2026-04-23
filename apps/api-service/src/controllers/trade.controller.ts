import { prisma } from "@repo/db";
import { Request, Response } from "express";


export const getOrders = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Unauthorized" });
        }

    } catch (error) {

    }
}

export const getOrderById = async (req: Request, res: Response) => {

}
export const createOrder = async (req: Request, res: Response) => {

}

export const closeOrder = async (req: Request, res: Response) => {

}
