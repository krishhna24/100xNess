-- CreateEnum
CREATE TYPE "Symbol" AS ENUM ('USDC', 'BTC');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('long', 'short');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('TakeProfit', 'StopLoss', 'Manual', 'Liquidation');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "symbol" "Symbol" NOT NULL,
    "balance" BIGINT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "userId" UUID NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'open',
    "qty" BIGINT NOT NULL,
    "qtyDecimals" INTEGER NOT NULL DEFAULT 2,
    "openingPrice" BIGINT NOT NULL,
    "closingPrice" BIGINT,
    "pnl" BIGINT,
    "decimals" INTEGER NOT NULL DEFAULT 4,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "margin" BIGINT NOT NULL,
    "takeProfit" BIGINT,
    "stopLoss" BIGINT,
    "closeReason" "CloseReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_userId_symbol_key" ON "Asset"("userId", "symbol");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
