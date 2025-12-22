# Add Ons Setup Guide

## Step 1: Create Database Tables

Run the SQL script in Supabase SQL Editor:

```sql
-- Run: create-activities-table.sql
```

This creates:
- `activities` table
- `diy_kits` table

## Step 2: Restore Existing Activities

Run this SQL script to restore all your original activities:

```sql
-- Run: insert-default-activities.sql
```

This will insert all 7 original activities:
- Tufting
- Jewelry Making
- Noted
- Protector
- Plushie heaven
- Magnetic world
- Retro Writes

**Note:** The script uses `ON CONFLICT DO NOTHING`, so it's safe to run multiple times.

## Step 3: Set Up Supabase Storage (For Image Uploads)

### Option A: Use Supabase Storage (Recommended - Free up to 1GB)

1. **Create Storage Bucket:**
   - Go to Supabase Dashboard → Storage
   - Click "New bucket"
   - Name: `addons-images`
   - Make it **PUBLIC** (so images can be accessed via URL)
   - Click "Create bucket"

2. **Set Up Storage Policies:**
   - Run the SQL script: `setup-supabase-storage.sql`
   - This allows public read access and admin upload/delete access

3. **Install multer in backend:**
   ```bash
   cd backend
   npm install multer
   ```

### Option B: Use Image URLs (No Storage Setup Required)

- You can skip Supabase Storage setup
- Just enter image URLs directly in the admin form
- Images should be uploaded to your hosting (e.g., `/public/lovable-uploads/`)

## Step 4: Image Upload Feature

The admin page now supports:
- **File Upload:** Click "Choose Image File" → Select image → Click "Upload"
- **Image Preview:** See preview before uploading
- **URL Input:** Or manually enter image URL

### Storage Costs:
- **Supabase Storage:** Free up to 1GB, then $0.021/GB/month
- For typical images (100-500KB each), you can store 2,000-10,000 images for free
- Very cost-effective for image storage!

## Step 5: Access Admin Page

1. Log in as admin (knowhowcafe2025@gmail.com)
2. Navigate to "Add Ons" in admin dashboard
3. Manage Activities and DIY Kits

## Troubleshooting

### Images not uploading?
- Check that Supabase Storage bucket `addons-images` exists and is PUBLIC
- Verify storage policies are set correctly
- Check backend logs for upload errors

### Activities not showing?
- Make sure you ran `insert-default-activities.sql`
- Check that activities table has data: `SELECT * FROM activities;`

### DIY Kits not showing?
- The table starts empty - add kits through the admin interface
- Or migrate existing data from `diyKits.ts` if needed

