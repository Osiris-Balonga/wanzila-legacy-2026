ALTER TABLE `Pharmacy`
  ADD COLUMN `matchKey` CHAR(64) NULL,
  ADD UNIQUE INDEX `Pharmacy_matchKey_key` (`matchKey`);

ALTER TABLE `Contribution`
  MODIFY COLUMN `latitude` DECIMAL(10,7) NULL,
  MODIFY COLUMN `longitude` DECIMAL(10,7) NULL,
  ADD COLUMN `submissionId` CHAR(36) NULL,
  ADD COLUMN `original` JSON NULL,
  ADD COLUMN `version` INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `reviewNote` VARCHAR(500) NULL,
  ADD COLUMN `notePurgedAt` DATETIME(3) NULL,
  ADD COLUMN `reviewedById` CHAR(36) NULL,
  ADD COLUMN `reviewedByName` VARCHAR(120) NULL,
  ADD UNIQUE INDEX `Contribution_submissionId_key` (`submissionId`),
  ADD CONSTRAINT `Contribution_coordinate_pair` CHECK ((`latitude` IS NULL AND `longitude` IS NULL) OR (`latitude` IS NOT NULL AND `longitude` IS NOT NULL)),
  ADD CONSTRAINT `Contribution_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ContributionCorrection` (
  `id` CHAR(36) NOT NULL,
  `contributionId` CHAR(36) NOT NULL,
  `version` INT UNSIGNED NOT NULL,
  `before` JSON NOT NULL,
  `after` JSON NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `correctedById` CHAR(36) NOT NULL,
  `correctedByName` VARCHAR(120) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ContributionCorrection_contributionId_version_key` (`contributionId`, `version`),
  CONSTRAINT `ContributionCorrection_contributionId_fkey` FOREIGN KEY (`contributionId`) REFERENCES `Contribution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContributionCorrection_correctedById_fkey` FOREIGN KEY (`correctedById`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
