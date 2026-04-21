import { CookieOptions } from "express";


export const jwtSecret = process.env.JWT_SECRET || "local-dev-secret";

const secureCookies =
    process.env.COOKIE_SECURE != null
        ? process.env.COOKIE_SECURE === "true"
        : process.env.NODE_ENV === "production";

const sameSite: CookieOptions["sameSite"] = secureCookies ? "none" : "lax";


export const authCookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite,
    secure: secureCookies,
    maxAge: 60 * 60 * 1000,
};

export const authCookieClearOptions: CookieOptions = {
    httpOnly: true,
    sameSite,
    secure: secureCookies,
};
