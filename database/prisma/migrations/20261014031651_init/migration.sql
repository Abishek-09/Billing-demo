-- CreateTable
CREATE TABLE `staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'CASHIER') NOT NULL DEFAULT 'CASHIER',
    `pinHash` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(500) NULL,
    `categoryId` INTEGER NOT NULL,
    `sellBy` ENUM('WEIGHT', 'PIECE') NOT NULL DEFAULT 'PIECE',
    `unit` VARCHAR(20) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `gstRate` INTEGER NOT NULL DEFAULT 5,
    `stockQty` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
    `lowStockLevel` DECIMAL(10, 3) NOT NULL DEFAULT 5.000,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_code_key`(`code`),
    INDEX `products_categoryId_idx`(`categoryId`),
    INDEX `products_categoryId_isActive_idx`(`categoryId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_counts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `countedQty` DECIMAL(10, 3) NOT NULL,
    `systemQty` DECIMAL(10, 3) NOT NULL,
    `difference` DECIMAL(10, 3) NOT NULL,
    `countedById` INTEGER NOT NULL,
    `note` TEXT NULL,
    `countedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_counts_productId_idx`(`productId`),
    INDEX `stock_counts_countedById_idx`(`countedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `day_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `openedById` INTEGER NOT NULL,
    `closedById` INTEGER NULL,
    `openingCash` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `closingCash` DECIMAL(10, 2) NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `totalSales` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalBills` INTEGER NOT NULL DEFAULT 0,
    `itemsSold` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
    `discountsGiven` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `cgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `sgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `voidedBills` INTEGER NOT NULL DEFAULT 0,

    INDEX `day_sessions_openedById_idx`(`openedById`),
    INDEX `day_sessions_closedById_idx`(`closedById`),
    INDEX `day_sessions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `billNo` VARCHAR(50) NOT NULL,
    `sessionId` INTEGER NOT NULL,
    `cashierId` INTEGER NOT NULL,
    `status` ENUM('HELD', 'PAID', 'VOIDED') NOT NULL DEFAULT 'PAID',
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountNote` VARCHAR(255) NULL,
    `cgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `sgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `paymentMode` ENUM('CASH', 'UPI', 'CARD') NOT NULL DEFAULT 'CASH',
    `amountReceived` DECIMAL(10, 2) NULL,
    `changeReturned` DECIMAL(10, 2) NULL,
    `voidReason` TEXT NULL,
    `voidedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bills_billNo_key`(`billNo`),
    INDEX `bills_sessionId_idx`(`sessionId`),
    INDEX `bills_cashierId_idx`(`cashierId`),
    INDEX `bills_voidedById_idx`(`voidedById`),
    INDEX `bills_createdAt_idx`(`createdAt`),
    INDEX `bills_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bill_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `billId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `productName` VARCHAR(150) NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `sellBy` ENUM('WEIGHT', 'PIECE') NOT NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `gstRate` INTEGER NOT NULL,
    `qty` INTEGER NULL,
    `weightKg` DECIMAL(10, 3) NULL,
    `lineDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `lineTotal` DECIMAL(10, 2) NOT NULL,

    INDEX `bill_items_billId_idx`(`billId`),
    INDEX `bill_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopName` VARCHAR(150) NOT NULL,
    `address` TEXT NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `gstin` VARCHAR(30) NOT NULL,
    `receiptFooter` VARCHAR(255) NOT NULL,
    `printerWidth` INTEGER NOT NULL DEFAULT 80,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffId` INTEGER NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity` VARCHAR(100) NOT NULL,
    `entityId` VARCHAR(100) NOT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_staffId_idx`(`staffId`),
    INDEX `audit_logs_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_countedById_fkey` FOREIGN KEY (`countedById`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `day_sessions` ADD CONSTRAINT `day_sessions_openedById_fkey` FOREIGN KEY (`openedById`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `day_sessions` ADD CONSTRAINT `day_sessions_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bills` ADD CONSTRAINT `bills_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `day_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bills` ADD CONSTRAINT `bills_cashierId_fkey` FOREIGN KEY (`cashierId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bills` ADD CONSTRAINT `bills_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_items` ADD CONSTRAINT `bill_items_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_items` ADD CONSTRAINT `bill_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
