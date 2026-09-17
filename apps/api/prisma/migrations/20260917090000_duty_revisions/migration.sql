ALTER TABLE `DutyPeriod`
  ADD COLUMN `version` INTEGER UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE `DutyRevision` (
  `id` CHAR(36) NOT NULL,
  `dutyPeriodId` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `openRevisionKey` CHAR(1) NULL,
  `baseVersion` INTEGER UNSIGNED NOT NULL,
  `beforeSourceId` CHAR(36) NULL,
  `beforeStartsAt` DATETIME(3) NOT NULL,
  `beforeEndsAt` DATETIME(3) NOT NULL,
  `proposedSourceId` CHAR(36) NULL,
  `proposedStartsAt` DATETIME(3) NOT NULL,
  `proposedEndsAt` DATETIME(3) NOT NULL,
  `submissionNote` VARCHAR(500) NOT NULL,
  `submittedById` CHAR(36) NOT NULL,
  `submittedByName` VARCHAR(120) NOT NULL,
  `submittedAt` DATETIME(3) NOT NULL,
  `reviewNote` VARCHAR(500) NULL,
  `reviewedById` CHAR(36) NULL,
  `reviewedByName` VARCHAR(120) NULL,
  `reviewedAt` DATETIME(3) NULL,

  UNIQUE INDEX `DutyRevision_dutyPeriodId_openRevisionKey_key` (`dutyPeriodId`, `openRevisionKey`),
  INDEX `DutyRevision_dutyPeriodId_submittedAt_id_idx` (`dutyPeriodId`, `submittedAt`, `id`),
  CONSTRAINT `DutyRevision_before_interval` CHECK (`beforeEndsAt` > `beforeStartsAt`),
  CONSTRAINT `DutyRevision_proposed_interval` CHECK (`proposedEndsAt` > `proposedStartsAt`),
  -- MariaDB cannot reference the reviewedById FK column in a CHECK; the review
  -- route writes reviewer and timestamp atomically and the FK validates the ID.
  CONSTRAINT `DutyRevision_open_key` CHECK (
    (`status` = 'PENDING' AND `openRevisionKey` = '1' AND `reviewedAt` IS NULL)
    OR (`status` <> 'PENDING' AND `openRevisionKey` IS NULL AND `reviewedAt` IS NOT NULL)
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DutyRevision`
  ADD CONSTRAINT `DutyRevision_dutyPeriodId_fkey` FOREIGN KEY (`dutyPeriodId`) REFERENCES `DutyPeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DutyRevision_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DutyRevision_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
