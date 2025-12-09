import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// Use service role key for storage operations (admin access)
// Service role key bypasses RLS policies
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
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set. Image uploads may not work. Using regular key as fallback.');
}

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

// Upload image to Supabase Storage
// Using base64 encoding to avoid multer/busboy compatibility issues with Node.js 24
router.post('/image', verifyAdmin, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    // Accept base64 encoded images from frontend
    const { image, folder, filename } = req.body;
    
    if (!image) {
      return res.status(400).json({ success: false, message: 'No image data provided' });
    }

    // Convert base64 to buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Generate unique filename
    const timestamp = Date.now();
    const originalName = filename ? filename.replace(/[^a-zA-Z0-9.-]/g, '_') : `image-${timestamp}`;
    const fileName = `${folder}/${timestamp}-${originalName}`;
    
    // Detect MIME type
    let mimeType = 'image/png';
    if (image.startsWith('data:image/jpeg') || image.startsWith('data:image/jpg')) {
      mimeType = 'image/jpeg';
    } else if (image.startsWith('data:image/png')) {
      mimeType = 'image/png';
    } else if (image.startsWith('data:image/webp')) {
      mimeType = 'image/webp';
    } else if (image.startsWith('data:image/gif')) {
      mimeType = 'image/gif';
    }
    
    // Use admin client if available, otherwise fallback to regular client
    const storageClient = supabaseAdmin || supabase;
    
    if (!supabaseAdmin) {
      console.warn('⚠️  Using regular Supabase client. Service role key not configured.');
      console.warn('   Set SUPABASE_SERVICE_ROLE_KEY in .env for admin access.');
    } else {
      console.log('✅ Using Supabase admin client (service role) for upload');
    }
    
    // Upload to Supabase Storage
    const { data, error } = await storageClient.storage
      .from('addons-images')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      // If bucket doesn't exist, provide helpful error message
      if (error.message?.includes('Bucket not found') || error.message?.includes('not found')) {
        return res.status(500).json({ 
          success: false, 
          message: 'Storage bucket "addons-images" not found. Please create it in Supabase Dashboard → Storage.',
          error: error.message 
        });
      }
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to upload image',
        error: error.message 
      });
    }

    // Get public URL - Supabase Storage returns the URL in data.publicUrl
    const { data: urlData } = storageClient.storage
      .from('addons-images')
      .getPublicUrl(fileName);

    // Ensure we get the correct public URL format
    const publicUrl = urlData?.publicUrl || `${supabaseUrl}/storage/v1/object/public/addons-images/${fileName}`;
    
    console.log('✅ Image uploaded successfully:', {
      fileName,
      publicUrl,
      bucket: 'addons-images'
    });

    res.json({
      success: true,
      imageUrl: publicUrl,
      fileName: fileName
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

export default router;
