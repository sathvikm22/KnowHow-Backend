-- Insert default DIY kits (run this after creating the diy_kits table)
-- This preserves all your existing DIY kits

INSERT INTO diy_kits (name, price, description, image_url) VALUES
('DIY Make Your Own Candle Kit', 499, 'Create beautiful, aromatic candles with this complete kit. Includes wax, wicks, fragrance oils, and containers. Perfect for beginners and a great way to add a personal touch to your home decor.', NULL),
('DIY Avengers Wall Hanger Kits', 399, 'Showcase your love for Marvel superheroes with this wall hanger kit. Includes all materials needed to create stunning Avengers-themed wall decorations. Great for kids and Marvel fans!', NULL),
('DIY DC Super Hero Kits', 399, 'Bring DC Comics heroes to life with this creative wall hanger kit. Perfect for decorating your room with Batman, Superman, Wonder Woman, and more. All materials included.', NULL),
('DIY Crochet Keyring Kit', 299, 'Learn the art of crochet while creating adorable keyrings. Kit includes yarn, crochet hooks, and step-by-step instructions. Make cute accessories for yourself or as gifts.', NULL),
('Lippan Art Kit', 499, 'Explore traditional Indian Lippan art with this comprehensive kit. Create beautiful mud mirror work designs. Includes clay, mirrors, and detailed instructions for authentic Lippan artwork.', NULL),
('Mandala Art Kit', 499, 'Create stunning mandala designs with this complete art kit. Includes fine-tip pens, compass, and templates. Perfect for stress relief and creating beautiful, intricate patterns.', NULL),
('Paint Your Own Photo Frame', 349, 'Personalize your memories with this paint-your-own photo frame kit. Includes wooden frame, paints, brushes, and decorative elements. Make a unique frame for your favorite photos.', NULL),
('Paint By Numbers', 299, 'Relax and create beautiful artwork with this paint-by-numbers kit. Includes pre-printed canvas, numbered paints, and brushes. Perfect for beginners and art enthusiasts alike.', NULL),
('Diamond Painting Kit', 399, 'Create sparkling artwork with diamond painting. Kit includes adhesive canvas, colorful resin diamonds, applicator tool, and tray. Create stunning, shimmering art pieces.', NULL),
('Diamond Painting Clock Kit', 499, 'Combine art and functionality with this diamond painting clock kit. Create a beautiful, sparkling clock for your wall. Includes clock mechanism, diamonds, and all materials.', NULL),
('DIY Mason Jar Kit', 499, 'Transform ordinary mason jars into beautiful decorative pieces. Kit includes jars, paints, brushes, and decorative materials. Perfect for home decor and gift-making.', NULL),
('DIY Fridge Magnet with Bag Kit', 399, 'Create custom fridge magnets and a matching bag. Kit includes magnet sheets, fabric, decorative elements, and instructions. Add personality to your kitchen and accessories.', NULL),
('DIY Embroidery Kit', 399, 'Learn the timeless art of embroidery. Kit includes fabric, embroidery threads, needles, hoop, and patterns. Create beautiful hand-stitched designs for clothing and home decor.', NULL),
('DIY Pouch Embroidery Kit', 399, 'Create a beautiful embroidered pouch with this complete kit. Includes pouch fabric, threads, needles, and embroidery patterns. Perfect for storing small items in style.', NULL),
('DIY Tote Bag Embroidery Kit', 399, 'Design your own embroidered tote bag. Kit includes canvas tote bag, embroidery threads, needles, and patterns. Create a unique, eco-friendly shopping bag.', NULL),
('DIY Punch Needles Kit', 499, 'Explore the art of punch needle embroidery. Kit includes punch needle tool, yarn, fabric, and patterns. Create textured, beautiful designs with this relaxing craft.', NULL),
('DIY Origami Kit', 199, 'Learn the ancient art of paper folding with this origami kit. Includes colorful origami paper, instruction book, and patterns. Create animals, flowers, and decorative items.', NULL),
('DIY Clock Kit', 799, 'Build and decorate your own functional clock. Kit includes clock mechanism, clock face, decorative materials, and instructions. Create a unique timepiece for your home.', NULL),
('Animal Kingdom Kit', 299, 'Create adorable animal-themed crafts with this kit. Includes materials to make various animal decorations and accessories. Perfect for kids and animal lovers.', NULL),
('Wall Hanger Kits', 299, 'Decorate your walls with beautiful handmade hangers. Kit includes materials to create multiple wall hanging designs. Add a bohemian touch to your living space.', NULL),
('Mandala Coaster Kits', 399, 'Create stunning mandala-patterned coasters for your home. Kit includes coaster blanks, paints, brushes, and mandala templates. Protect your furniture in style.', NULL)
ON CONFLICT (name) DO NOTHING;

