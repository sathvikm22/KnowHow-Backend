import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set SUPABASE_URL and SUPABASE_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
  try {
    const adminEmail = 'knowhowcafe2025@gmail.com';
    const adminPassword = 'password';
    const adminName = 'Admin';

    console.log('🔐 Creating admin user...');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);

    // Check if admin already exists
    const { data: existingAdmin, error: checkError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', adminEmail.toLowerCase())
      .maybeSingle();

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists. Updating password...');
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // Update admin password
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password: hashedPassword,
          name: adminName,
          updated_at: new Date().toISOString()
        })
        .eq('email', adminEmail.toLowerCase());

      if (updateError) {
        console.error('❌ Error updating admin:', updateError);
        process.exit(1);
      }

      console.log('✅ Admin password updated successfully!');
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔑 Password: ${adminPassword}`);
      console.log('\n💡 You can now login with these credentials.');
    } else {
      // Hash password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      // Create admin user
      const { data: newAdmin, error: createError } = await supabase
        .from('users')
        .insert({
          email: adminEmail.toLowerCase(),
          name: adminName,
          password: hashedPassword,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating admin:', createError);
        process.exit(1);
      }

      console.log('✅ Admin user created successfully!');
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔑 Password: ${adminPassword}`);
      console.log(`🆔 User ID: ${newAdmin.id}`);
      console.log('\n💡 You can now login with these credentials.');
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
createAdmin()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

