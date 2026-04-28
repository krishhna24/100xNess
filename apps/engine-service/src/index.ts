import { client } from "./client";
import { ENGINE_STREAM } from "./constants";
import { state } from "./state";
import type { EngineMessage } from "@repo/types";
import { loadSnapshot, createSnapshot } from "./snapshot";
import { getFieldValue } from "./utils";
import { handlePriceUpdate, handleCreateOrder, handleCloseOrder } from "./handlers";

setInterval(createSnapshot, 10000);

async function engine() {
    console.log("Trading Engine initialized on port 3002");
    await loadSnapshot();

    while (true) {
        try {
            const res = await client.xread("BLOCK", 0, "STREAMS", ENGINE_STREAM, state.lastId);
            if (!res?.length) continue;

            const [, messages] = res[0]!;
            if (!messages?.length) continue;

            for (const [id, fields] of messages) {
                state.lastId = id;
                const raw = getFieldValue(fields as string[], "data");
                if (!raw) continue;

                let msg: EngineMessage | { id: string; request: EngineMessage };
                try {
                    msg = JSON.parse(raw) as typeof msg;
                } catch {
                    console.log(`[ENGINE] Failed to parse:`, raw);
                    continue;
                }

                const engineMsg: EngineMessage = "request" in msg ? msg.request : msg;
                const { kind, payload } = engineMsg;

                switch (kind) {
                    case "price-update":  await handlePriceUpdate(payload);  break;
                    case "create-order":  await handleCreateOrder(payload);  break;
                    case "close-order":   await handleCloseOrder(payload);   break;
                    default: break;
                }
            }
        } catch (err) {
            console.error("engine-loop error:", err);
        }
    }
}

engine();
