-- Fix Storage Policies for addons-images bucket
-- Run this in Supabase SQL Editor after creating the bucket
-- This ensures service role (backend) can upload images

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Service role can upload to addons-images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update addons-images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete from addons-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to addons-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update addons-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from addons-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for addons-images" ON storage.objects;

-- Allow service role (backend) to upload - NO AUTH CHECK (service role bypasses RLS)
CREATE POLICY "Service role can upload to addons-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'addons-images');

-- Allow service role to update
CREATE POLICY "Service role can update addons-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'addons-images');

-- Allow service role to delete
CREATE POLICY "Service role can delete from addons-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'addons-images');

-- Allow public read access (so images can be viewed)
CREATE POLICY "Public read access for addons-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'addons-images');

-- Optional: Allow authenticated users to upload (for frontend direct uploads)
CREATE POLICY "Authenticated users can upload to addons-images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'addons-images' 
  AND auth.role() = 'authenticated'
);

-- Optional: Allow authenticated users to update
CREATE POLICY "Authenticated users can update addons-images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'addons-images' 
  AND auth.role() = 'authenticated'
);

-- Optional: Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete from addons-images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'addons-images' 
  AND auth.role() = 'authenticated'
);

