-- Insert default activities (run this after creating the activities table)
-- This preserves all your existing activities

INSERT INTO activities (name, description, image_url, emoji, color) VALUES
('Tufting', 'Create beautiful rugs and wall hangings with our tufting guns', '/lovable-uploads/735e4c76-0ab7-4639-ae6d-9396664ed8d2.png', '🧵', 'from-pink-300 via-orange-300 to-yellow-300'),
('Jewelry Making', 'Craft unique pieces from scratch with premium materials', '/lovable-uploads/6a588c51-e84c-4b71-b88d-e7d7a9868814.png', '💎', 'from-blue-300 via-purple-300 to-pink-300'),
('Noted', 'Design your own dream leather diary', '/lovable-uploads/d7cfafb7-f6d1-4e5d-9531-63ee12b1e49d.png', '📖', 'from-pink-300 via-red-300 to-orange-300'),
('Protector', 'Create your own vibey phone case', '/lovable-uploads/09ae03f1-4482-4d23-90bf-660795747349.png', '📱', 'from-blue-300 via-indigo-300 to-purple-300'),
('Plushie heaven', 'Craft your plushie buddy from scratch', '/lovable-uploads/0e6eee87-afef-4104-9ec6-b5fed2735365.png', '🧸', 'from-green-300 via-emerald-300 to-teal-300'),
('Magnetic world', 'Customize fridge magnets with love', '/lovable-uploads/6619328f-c411-46c0-b5cc-d0c0328c45bc.png', '🧲', 'from-purple-300 via-pink-300 to-red-300'),
('Retro Writes', 'Craft heartfelt messages and beautiful calligraphy', '/lovable-uploads/letter_writing_retro.png', '✍️', 'from-gray-300 via-blue-300 to-indigo-300')
ON CONFLICT (name) DO NOTHING;
