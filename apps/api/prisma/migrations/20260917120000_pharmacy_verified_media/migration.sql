ALTER TABLE `Pharmacy`
  ADD COLUMN `recordSource` VARCHAR(255) NULL,
  ADD COLUMN `recordVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `photoAssetPath` VARCHAR(255) NULL,
  ADD COLUMN `photoSource` VARCHAR(255) NULL,
  ADD COLUMN `photoCredit` VARCHAR(255) NULL,
  ADD COLUMN `photoRights` VARCHAR(255) NULL,
  ADD COLUMN `photoVerifiedAt` DATETIME(3) NULL,
  ADD CONSTRAINT `Pharmacy_record_provenance_pair` CHECK (
    (`recordSource` IS NULL AND `recordVerifiedAt` IS NULL) OR
    (`recordSource` IS NOT NULL AND `recordVerifiedAt` IS NOT NULL)
  ),
  ADD CONSTRAINT `Pharmacy_photo_metadata_complete` CHECK (
    (`photoAssetPath` IS NULL AND `photoSource` IS NULL AND `photoCredit` IS NULL AND `photoRights` IS NULL AND `photoVerifiedAt` IS NULL) OR
    (`photoAssetPath` IS NOT NULL AND `photoSource` IS NOT NULL AND `photoCredit` IS NOT NULL AND `photoRights` IS NOT NULL AND `photoVerifiedAt` IS NOT NULL)
  );
