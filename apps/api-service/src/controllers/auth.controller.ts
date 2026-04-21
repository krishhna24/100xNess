import { Request, Response } from "express";
import { prisma } from "@repo/db";
import { loginSchema, registerSchema } from "../schemas/auth.type";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken";
import { configDotenv } from "dotenv";
import { authCookieClearOptions, authCookieOptions, jwtSecret } from "../libs/runtime-config";

configDotenv();

export const register = async (req: Request, res: Response) => {
    try {
        const result = registerSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.error.message })
        }

        const { email, name, password } = result.data;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required" })
        }

        const userAlreadyExists = await prisma.user.findUnique({
            where: { email }
        })

        if (userAlreadyExists) {
            return res.status(400).json({ success: false, message: "User already exists" })
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword
            }
        });

        const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, jwtSecret, { expiresIn: "1h" })

        res.cookie("token", token, authCookieOptions);

        res.status(200).json({
            success: true, message: "User registered successfully", user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email
            }
        });
    } catch (err) {
        console.error("Error in register route: ", err);
        return res.status(500).json({ error: "INTERNAL SERVER ERROR" })
    }
}

export const login = async (req: Request, res: Response) => {
    try {
        const result = loginSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({ success: false, message: "Validation failed" })
        }

        const { email, password } = result.data;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email ad password required" });
        }

        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                name: true,
                password: true,
                email: true
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: "Unauthorized" });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, {
            expiresIn: "1h",
        });

        res.cookie("token", token, authCookieOptions);
        res.status(200).json({
            success: true, message: "User logged in", token: token, user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        })

    } catch (err) {
        console.error("Error in register route: ", err);
        return res.status(500).json({ error: "INTERNAL SERVER ERROR" })
    }
}

export const logout = (req: Request, res: Response) => {
    try {
        res.clearCookie("token", authCookieClearOptions);
        res.json({ message: "Logout successful" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const me = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(400).json({ success: false, message: "Not authenticated" });
        }

        const userData = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                email: true,
                name: true,
            }
        });

        if (!userData) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            user: userData
        });

    } catch (err) {
        console.error("Get user error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
}
