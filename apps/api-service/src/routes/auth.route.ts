import express, { Router } from "express"
import { login, logout, me, register } from "../controllers/auth.controller";
import { isAuth } from "../middlewares/auth";

export const authRouter: Router = express.Router();

authRouter.post("/login", login);
authRouter.post("/register", register);
authRouter.post("/logout", logout);
authRouter.get("/me", isAuth, me);
