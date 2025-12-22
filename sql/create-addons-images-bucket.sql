-- Create the addons-images storage bucket in Supabase
-- Run this in Supabase SQL Editor

-- Note: Storage buckets are typically created via the Dashboard UI,
-- but you can also use the Storage API. This script provides the SQL approach.

-- First, ensure the storage schema exists
CREATE SCHEMA IF NOT EXISTS storage;

-- Create the bucket (if it doesn't exist)
-- Note: This requires the storage extension to be enabled
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'addons-images',
  'addons-images',
  true,  -- Public bucket (images can be accessed via public URL)
  5242880,  -- 5MB file size limit (in bytes)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']  -- Allowed image types
)
ON CONFLICT (id) DO NOTHING;

-- Create policy to allow public read access
CREATE POLICY "Public Access for addons-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'addons-images');

-- IMPORTANT: Service role key should bypass RLS, but we'll add policies for safety
-- Allow service role (backend) to upload - this bypasses RLS when using service role key
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

-- Allow authenticated users to upload (for frontend direct uploads if needed)
CREATE POLICY "Authenticated users can upload to addons-images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'addons-images' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update addons-images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'addons-images' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete from addons-images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'addons-images' 
  AND auth.role() = 'authenticated'
);

