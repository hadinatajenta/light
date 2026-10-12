ALTER TABLE agents ADD COLUMN categories TEXT;
UPDATE agents SET categories = '["' || category || '"]' WHERE category IS NOT NULL AND TRIM(category) <> '';
