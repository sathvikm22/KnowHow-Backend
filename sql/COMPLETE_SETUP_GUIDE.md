# Complete Setup Guide for Activities and DIY Kits

## Step 1: Run SQL Scripts in Supabase

Run these scripts **in order** in Supabase SQL Editor:

### 1. Create Tables
```sql
-- File: create-activities-table.sql
-- Creates activities and diy_kits tables
```

### 2. Update Schema (Remove emoji/color, ensure image_url is TEXT)
```sql
-- File: update-activities-diy-kits-schema.sql
-- Removes emoji and color columns
-- Ensures image_url is TEXT type for long URLs
```

### 3. Insert Default Activities
```sql
-- File: insert-default-activities.sql
-- Restores all 7 original activities
```

### 4. Insert Default DIY Kits
```sql
-- File: insert-default-diy-kits.sql
-- Restores all 21 original DIY kits
```

## Step 2: Set Up Supabase Storage

1. Go to Supabase Dashboard → **Storage**
2. Click **"New bucket"**
3. Name: `addons-images`
4. Make it **PUBLIC** (important!)
5. Click **"Create bucket"**
6. Run the storage policies SQL (from `setup-supabase-storage.sql`)

## Step 3: Verify Image Upload Flow

### How It Works:
1. **Upload**: Admin selects image → converts to base64 → uploads to Supabase Storage
2. **Save URL**: Image URL is saved to form state
3. **Save to DB**: When form is saved, `image_url` is saved to database
4. **Display**: User pages fetch activities/kits and display `image_url`

### Debugging:
- Check browser console for logs:
  - `✅ Image uploaded, URL: ...` - Upload successful
  - `💾 Saving activity/DIY kit with payload: ...` - Form data being sent
  - `📥 Save response: ...` - Backend response
- Check backend logs for:
  - `✅ Image uploaded successfully: ...`
  - `📝 Creating/Updating activity/DIY kit: ...`
  - `✅ Activity/DIY kit created/updated: ...`

## Step 4: Verify Database

Check that images are saved:
```sql
SELECT id, name, image_url FROM activities WHERE image_url IS NOT NULL;
SELECT id, name, image_url FROM diy_kits WHERE image_url IS NOT NULL;
```

## Troubleshooting

### Images not showing on user pages?
1. Check if `image_url` is saved in database (run SQL above)
2. Check browser console for image load errors
3. Verify Supabase Storage bucket is PUBLIC
4. Check that image URLs are full Supabase Storage URLs (should start with `https://`)

### Image upload fails?
1. Check Supabase Storage bucket exists and is PUBLIC
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in backend `.env`
3. Check backend logs for upload errors

### Edit not working?
- Form should reset after save
- Check console logs to see if save is successful
- Verify `editingId` is cleared after save

