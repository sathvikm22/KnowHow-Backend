-- Update existing activities with their category
-- Group activities: Noted, Protector, Plushie heaven, Magnetic world, Retro Writes
-- Individual activities: Jewelry Making, Tufting Experience

-- Update group activities
UPDATE activities 
SET category = 'group'
WHERE name IN ('Noted', 'Protector', 'Plushie heaven', 'Magnetic world', 'Retro Writes');

-- Update individual activities (case-insensitive matching)
UPDATE activities 
SET category = 'individual'
WHERE LOWER(name) IN ('jewelry making', 'jewellery making', 'jewellery lab', 'tufting experience', 'tufting');

-- If any activities don't match, set them to 'group' as default
UPDATE activities 
SET category = 'group'
WHERE category IS NULL;

