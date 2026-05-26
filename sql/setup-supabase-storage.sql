-- Setup Supabase Storage for Add Ons Images
-- Run this in Supabase SQL Editor after creating the storage bucket

-- Create storage bucket for addons images (if it doesn't exist)
-- Note: You need to create the bucket manually in Supabase Dashboard:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Click "New bucket"
-- 3. Name: "addons-images"
-- 4. Make it PUBLIC (so images can be accessed via URL)
-- 5. Click "Create bucket"

-- Set up storage policies (run this after creating the bucket)
-- Allow public read access
CREATE POLICY IF NOT EXISTS "Public read access for addons-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'addons-images');

-- Allow authenticated users (admins) to upload
CREATE POLICY IF NOT EXISTS "Admin upload access for addons-images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'addons-images' AND
  auth.role() = 'authenticated'
);

-- Allow authenticated users (admins) to update
CREATE POLICY IF NOT EXISTS "Admin update access for addons-images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'addons-images' AND
  auth.role() = 'authenticated'
);

-- Allow authenticated users (admins) to delete
CREATE POLICY IF NOT EXISTS "Admin delete access for addons-images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'addons-images' AND
  auth.role() = 'authenticated'
);

