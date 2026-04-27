export function safeNum(n: any, def = 0): number {
    const v = Number(n);
    return Number.isFinite(v) ? v : def;
}

export function getFieldValue(fields: string[], key: string): string | undefined {
    for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === key) return fields[i + 1];
    }
    return undefined;
}
