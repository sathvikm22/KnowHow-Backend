-- Fix Activity Image URLs
-- This script updates the image_url values for activities to match the actual files in /lovable-uploads/
-- Run this in Supabase SQL Editor

UPDATE activities 
SET image_url = '/lovable-uploads/6619328f-c411-46c0-b5cc-d0c0328c45bc.png'
WHERE LOWER(name) = 'magnetic world';

UPDATE activities 
SET image_url = '/lovable-uploads/0e6eee87-afef-4104-9ec6-b5fed2735365.png'
WHERE LOWER(name) = 'plushie heaven';

UPDATE activities 
SET image_url = '/lovable-uploads/735e4c76-0ab7-4639-ae6d-9396664ed8d2.png'
WHERE LOWER(name) LIKE '%tufting%';

UPDATE activities 
SET image_url = '/lovable-uploads/letter_writing_retro.png'
WHERE LOWER(name) LIKE '%retro%' OR LOWER(name) LIKE '%writes%';

UPDATE activities 
SET image_url = '/lovable-uploads/6a588c51-e84c-4b71-b88d-e7d7a9868814.png'
WHERE LOWER(name) LIKE '%jewelry%' OR LOWER(name) LIKE '%jewellery%';

UPDATE activities 
SET image_url = '/lovable-uploads/d7cfafb7-f6d1-4e5d-9531-63ee12b1e49d.png'
WHERE LOWER(name) = 'noted';

UPDATE activities 
SET image_url = '/lovable-uploads/09ae03f1-4482-4d23-90bf-660795747349.png'
WHERE LOWER(name) = 'protector';

-- Verify the updates
SELECT name, image_url 
FROM activities 
WHERE name IN ('Magnetic world', 'Plushie heaven', 'Tufting', 'Retro Writes', 'Jewelry Making', 'Noted', 'Protector')
ORDER BY name;
