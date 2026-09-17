CREATE TABLE `RouteAttempt` (
  `id` CHAR(36) NOT NULL,
  `pharmacyId` CHAR(36) NOT NULL,
  `sessionId` CHAR(36) NOT NULL,
  `outcome` ENUM('UNKNOWN', 'GPS_CONFIRMED', 'USER_DECLARED', 'STOPPED', 'ALREADY_NEARBY') NOT NULL DEFAULT 'UNKNOWN',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  INDEX `RouteAttempt_startedAt_outcome_idx` (`startedAt`, `outcome`),
  INDEX `RouteAttempt_pharmacyId_startedAt_idx` (`pharmacyId`, `startedAt`),
  CONSTRAINT `RouteAttempt_outcome_timestamp` CHECK (
    (`outcome` = 'UNKNOWN' AND `resolvedAt` IS NULL)
    OR (`outcome` <> 'UNKNOWN' AND `resolvedAt` IS NOT NULL)
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
