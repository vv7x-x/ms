const { createClient } = require('@supabase/supabase-js');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
} else {
    console.warn('Supabase not configured (SUPABASE_URL/KEY missing). API DB routes will fail until configured.');
}

module.exports = supabase;
