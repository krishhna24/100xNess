import { Request, Response, } from "express";
import { GetCandlesQuerySchema } from "../schemas/candles.type";


export const getCandles = async (req: Request, res: Response) => {
    try {
        const responseult = GetCandlesQuerySchema.safeParse(req.query);
        if (!responseult.success) {
            return res.status(400).json({ success: false, message: "Validation failed" });
        }

        const { ts: timeFrame, startTime, endTime, asset } = responseult.data;

        let symbol = asset.toUpperCase();

        if (symbol === "BTCUSDT" || symbol === "BTCUSDC") {
            symbol = "BTC_USDC";
        } else if (symbol === "ETHUSDT" || symbol === "ETHUSDC") {
            symbol = "ETH_USDC";
        } else if (symbol === "SOLUSDT" || symbol === "SOLUSDC") {
            symbol = "SOL_USDC";
        }

        const nowInSeconds = Math.floor(Date.now() / 1000);

        let timeRangeInSeconds;

        switch (timeFrame) {
            case "1m":
                timeRangeInSeconds = 24 * 60 * 60;
                break;
            case "3m":
                timeRangeInSeconds = 2 * 24 * 60 * 60;
                break;
            case "5m":
                timeRangeInSeconds = 3 * 24 * 60 * 60;
                break;
            case "15m":
                timeRangeInSeconds = 7 * 24 * 60 * 60;
                break;
            case "30m":
                timeRangeInSeconds = 14 * 24 * 60 * 60;
                break;
            case "1h":
                timeRangeInSeconds = 30 * 24 * 60 * 60;
                break;
            case "2h":
                timeRangeInSeconds = 45 * 24 * 60 * 60;
                break;
            case "4h":
                timeRangeInSeconds = 60 * 24 * 60 * 60;
                break;
            case "6h":
                timeRangeInSeconds = 90 * 24 * 60 * 60;
                break;
            case "8h":
                timeRangeInSeconds = 120 * 24 * 60 * 60;
                break;
            case "12h":
                timeRangeInSeconds = 180 * 24 * 60 * 60;
                break;
            case "1d":
                timeRangeInSeconds = 365 * 24 * 60 * 60;
                break;
            case "3d":
                timeRangeInSeconds = 3 * 365 * 24 * 60 * 60;
                break;
            case "1w":
                timeRangeInSeconds = 2 * 365 * 24 * 60 * 60;
                break;
            case "1M":
                timeRangeInSeconds = 5 * 365 * 24 * 60 * 60;
                break;
            default:
                timeRangeInSeconds = 7 * 24 * 60 * 60;
        }

        const realStartTime = nowInSeconds - timeRangeInSeconds;
        const realEndTime = nowInSeconds;

        const backpackUrl = `https://api.backpack.exchange/api/v1/klines?symbol=${symbol}&interval=${timeFrame}&startTime=${realStartTime}&endTime=${realEndTime}`;

        const response = await fetch(backpackUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                `Backpack API error: ${response.status} ${response.statusText}`,
                errorText
            );
            throw new Error(
                `Backpack API error: ${response.status} ${response.statusText}`
            );
        }

        const data = await response.json();

        type BackpackCandle = { start: number; open: string; high: string; low: string; close: string; volume: string };
        const processedData = (data as BackpackCandle[]).map((candle) => ({
            bucket: candle.start,
            symbol: asset,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
            volume: parseFloat(candle.volume),
            time: candle.start,
        }))

        res.status(200).json({ success: true, data: processedData });

    } catch (err) {
        console.error("Error in getCandles: ", err)
        return res.status(500).json({ success: false, message: "Internal Server Error" })
    }
}
