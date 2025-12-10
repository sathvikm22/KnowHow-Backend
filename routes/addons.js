import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Use service role key for storage operations (admin access)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Create Supabase client with service role for admin storage operations
let supabaseAdmin = null;
if (supabaseUrl && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set. Image deletion may not work.');
}

// Helper function to extract file path from Supabase Storage URL
const extractFilePathFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  // Supabase Storage URLs typically look like:
  // https://[project].supabase.co/storage/v1/object/public/addons-images/[folder]/[filename]
  const match = url.match(/\/storage\/v1\/object\/public\/addons-images\/(.+)$/);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
};

// Helper function to delete image from Supabase Storage
const deleteImageFromStorage = async (imageUrl) => {
  if (!imageUrl || !imageUrl.trim()) {
    return { success: true, message: 'No image URL provided' };
  }

  const filePath = extractFilePathFromUrl(imageUrl);
  if (!filePath) {
    console.log('⚠️  Could not extract file path from URL:', imageUrl);
    console.log('   This might not be a Supabase Storage URL, skipping deletion');
    return { success: true, message: 'Not a Supabase Storage URL, skipping deletion' };
  }

  if (!supabaseAdmin) {
    console.warn('⚠️  Supabase admin client not available. Cannot delete image.');
    return { success: false, message: 'Admin client not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('addons-images')
      .remove([filePath]);

    if (error) {
      console.error('❌ Error deleting image from storage:', error);
      // Don't fail the request if image deletion fails - it might already be deleted
      return { success: false, message: error.message };
    }

    console.log('✅ Deleted old image from storage:', filePath);
    return { success: true, message: 'Image deleted successfully' };
  } catch (error) {
    console.error('❌ Exception while deleting image:', error);
    // Don't fail the request if image deletion fails
    return { success: false, message: error.message };
  }
};

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', decoded.userId)
      .single();

    if (!user || user.email.toLowerCase() !== 'knowhowcafe2025@gmail.com') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ==================== ACTIVITIES ROUTES ====================

// Get all activities
router.get('/activities', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('id, name, description, image_url, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching activities:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch activities' });
    }

    console.log('📥 Fetched activities:', data?.length || 0);
    if (data && data.length > 0) {
      data.forEach((activity) => {
        console.log(`   - ${activity.name}: image_url = ${activity.image_url || 'NULL'}`);
      });
    }

    res.json({ success: true, activities: data || [] });
  } catch (error) {
    console.error('Error in GET /activities:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create activity (Admin only)
router.post('/activities', verifyAdmin, async (req, res) => {
  try {
    const { name, description, image_url } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Name and description are required' });
    }

    console.log('📝 Creating activity:', { name, description, image_url });
    console.log('   Image URL received:', image_url);
    console.log('   Image URL type:', typeof image_url);

    const insertData = {
      name,
      description,
      image_url: image_url && image_url.trim() !== '' ? image_url.trim() : null
    };
    
    console.log('   Insert data being sent to DB:', insertData);

    const { data, error } = await supabase
      .from('activities')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating activity:', error);
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ success: false, message: 'Activity with this name already exists' });
      }
      return res.status(500).json({ success: false, message: 'Failed to create activity' });
    }

    console.log('✅ Activity created successfully!');
    console.log('   Created activity data:', data);
    console.log('   Image URL in database:', data.image_url);
    res.json({ success: true, activity: data });
  } catch (error) {
    console.error('Error in POST /activities:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update activity (Admin only)
router.put('/activities/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image_url } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Name and description are required' });
    }

    console.log('📝 Updating activity:', { id, name, description, image_url });
    console.log('   Image URL received:', image_url);
    console.log('   Image URL type:', typeof image_url);
    console.log('   Image URL length:', image_url?.length);

    // Fetch current activity to get old image URL
    const { data: currentActivity, error: fetchError } = await supabase
      .from('activities')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching current activity:', fetchError);
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    const oldImageUrl = currentActivity?.image_url;
    const newImageUrl = image_url && image_url.trim() !== '' ? image_url.trim() : null;

    // Delete old image if it exists and is different from the new one
    if (oldImageUrl && oldImageUrl !== newImageUrl) {
      console.log('🗑️  Deleting old image:', oldImageUrl);
      await deleteImageFromStorage(oldImageUrl);
    }

    const updateData = {
      name,
      description,
      image_url: newImageUrl
    };
    
    console.log('   Update data being sent to DB:', updateData);

    const { data, error } = await supabase
      .from('activities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating activity:', error);
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'Activity with this name already exists' });
      }
      return res.status(500).json({ success: false, message: 'Failed to update activity' });
    }

    if (!data) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    console.log('✅ Activity updated successfully!');
    console.log('   Updated activity data:', data);
    console.log('   Image URL in database:', data.image_url);
    res.json({ success: true, activity: data });
  } catch (error) {
    console.error('Error in PUT /activities/:id:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete activity (Admin only)
router.delete('/activities/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch activity to get image URL before deleting
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" - that's okay, we'll continue
      console.error('Error fetching activity before deletion:', fetchError);
    }

    // Delete the activity
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting activity:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete activity' });
    }

    // Delete associated image if it exists
    if (activity?.image_url) {
      console.log('🗑️  Deleting associated image:', activity.image_url);
      await deleteImageFromStorage(activity.image_url);
    }

    res.json({ success: true, message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /activities/:id:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==================== DIY KITS ROUTES ====================

// Get all DIY kits
router.get('/diy-kits', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('diy_kits')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching DIY kits:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch DIY kits' });
    }

    res.json({ success: true, kits: data || [] });
  } catch (error) {
    console.error('Error in GET /diy-kits:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get single DIY kit by name
router.get('/diy-kits/name/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const { data, error } = await supabase
      .from('diy_kits')
      .select('*')
      .eq('name', decodeURIComponent(name))
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'DIY kit not found' });
    }

    res.json({ success: true, kit: data });
  } catch (error) {
    console.error('Error in GET /diy-kits/name/:name:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create DIY kit (Admin only)
router.post('/diy-kits', verifyAdmin, async (req, res) => {
  try {
    const { name, price, image_url, description } = req.body;

    if (!name || !price || !description) {
      return res.status(400).json({ success: false, message: 'Name, price, and description are required' });
    }

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ success: false, message: 'Price must be a positive number' });
    }

    console.log('📝 Creating DIY kit:', { name, price, description, image_url });

    const { data, error } = await supabase
      .from('diy_kits')
      .insert({
        name,
        price: parseFloat(price),
        image_url: image_url || null,
        description
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating DIY kit:', error);
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'DIY kit with this name already exists' });
      }
      return res.status(500).json({ success: false, message: 'Failed to create DIY kit' });
    }

    console.log('✅ DIY kit created:', data);
    res.json({ success: true, kit: data });
  } catch (error) {
    console.error('Error in POST /diy-kits:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update DIY kit (Admin only)
router.put('/diy-kits/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, image_url, description } = req.body;

    if (!name || !price || !description) {
      return res.status(400).json({ success: false, message: 'Name, price, and description are required' });
    }

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ success: false, message: 'Price must be a positive number' });
    }

    console.log('📝 Updating DIY kit:', { id, name, price, description, image_url });

    // Fetch current DIY kit to get old image URL
    const { data: currentKit, error: fetchError } = await supabase
      .from('diy_kits')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching current DIY kit:', fetchError);
      return res.status(404).json({ success: false, message: 'DIY kit not found' });
    }

    const oldImageUrl = currentKit?.image_url;
    const newImageUrl = image_url && image_url.trim() !== '' ? image_url.trim() : null;

    // Delete old image if it exists and is different from the new one
    if (oldImageUrl && oldImageUrl !== newImageUrl) {
      console.log('🗑️  Deleting old image:', oldImageUrl);
      await deleteImageFromStorage(oldImageUrl);
    }

    const { data, error } = await supabase
      .from('diy_kits')
      .update({
        name,
        price: parseFloat(price),
        image_url: newImageUrl,
        description
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating DIY kit:', error);
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'DIY kit with this name already exists' });
      }
      return res.status(500).json({ success: false, message: 'Failed to update DIY kit' });
    }

    if (!data) {
      return res.status(404).json({ success: false, message: 'DIY kit not found' });
    }

    console.log('✅ DIY kit updated:', data);
    res.json({ success: true, kit: data });
  } catch (error) {
    console.error('Error in PUT /diy-kits/:id:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete DIY kit (Admin only)
router.delete('/diy-kits/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch DIY kit to get image URL before deleting
    const { data: kit, error: fetchError } = await supabase
      .from('diy_kits')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" - that's okay, we'll continue
      console.error('Error fetching DIY kit before deletion:', fetchError);
    }

    // Delete the DIY kit
    const { error } = await supabase
      .from('diy_kits')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting DIY kit:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete DIY kit' });
    }

    // Delete associated image if it exists
    if (kit?.image_url) {
      console.log('🗑️  Deleting associated image:', kit.image_url);
      await deleteImageFromStorage(kit.image_url);
    }

    res.json({ success: true, message: 'DIY kit deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /diy-kits/:id:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;

