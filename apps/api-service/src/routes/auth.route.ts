import express, { Router } from "express"
import { login, logout, me, register } from "../controllers/auth.controller";
import { isAuth } from "../middlewares/auth";

const router: Router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/logout", logout);
router.get("/me", isAuth, me);

export default router;
