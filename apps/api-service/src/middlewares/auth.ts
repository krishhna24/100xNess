import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../libs/runtime-config";
import { prisma } from "@repo/db";

interface JwtPayload {
    id: string;
    email: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: { id: string; email: string };
        }
    }
}


export const isAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = req.cookies?.token;
        if (!token) {
            res.status(400).json({ success: false, message: "Unauthorized,No token provided" });
            return
        }

        const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true },
        })

        if (!user) {
            res
                .status(401)
                .json({ status: "error", message: "User not found or inactive" });
            return;
        }

        req.user = { id: user.id, email: user.email };
        next();

    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            res.status(401).json({ status: "error", message: "Token expired" });
            return;
        }
        if (err instanceof jwt.JsonWebTokenError) {
            res.status(401).json({ status: "error", message: "Invalid token" });
            return;
        }
        next(err);
    }
}
