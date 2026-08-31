# Deploying Returns Ops to Supabase

This guide walks through deploying your returns workflow app to Supabase with production hosting.

## Phase 1: Set Up Supabase Project

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click **"New Project"**
4. Choose your organization
5. Enter project details:
   - **Name**: `returns-ops` (or your preferred name)
   - **Database Password**: Save this securely
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine for small business (upgradable later)
6. Click **"Create new project"** (takes ~2 minutes)

### 2. Run Database Migration

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Copy the entire contents of `supabase/migrations/001_init.sql` from your project
4. Paste into the SQL editor
5. Click **"Run"** to create all tables

### 3. Get Your API Keys

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (safe for client-side)
   - **service_role key** (keep secret, server-only)

### 4. Create Storage Bucket for Photos

1. In Supabase dashboard, go to **Storage**
2. Click **"New bucket"**
3. Create bucket:
   - **Name**: `inspection-photos`
   - **Public bucket**: No (keep private)
4. Click **"Create bucket"**

### 5. Set Up Row Level Security (RLS)

In SQL Editor, run these policies:

```sql
-- Enable RLS on all tables
alter table app_users enable row level security;
alter table catalog_products enable row level security;
alter table packages enable row level security;
alter table package_items enable row level security;
alter table upload_batches enable row level security;
alter table package_status_history enable row level security;
alter table inspection_photos enable row level security;

-- Policy: Allow authenticated users to read catalog
create policy "Allow authenticated read catalog"
  on catalog_products for select
  using (auth.role() = 'authenticated');

-- Policy: Allow authenticated users to manage packages
create policy "Allow authenticated manage packages"
  on packages for all
  using (auth.role() = 'authenticated');

-- Policy: Allow authenticated users to manage package items
create policy "Allow authenticated manage package_items"
  on package_items for all
  using (auth.role() = 'authenticated');

-- Policy: Allow authenticated users to upload
create policy "Allow authenticated manage uploads"
  on upload_batches for all
  using (auth.role() = 'authenticated');

-- Storage policy for inspection photos
create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'inspection-photos' and auth.role() = 'authenticated');

create policy "Authenticated users can view photos"
  on storage.objects for select
  using (bucket_id = 'inspection-photos' and auth.role() = 'authenticated');
```

### 6. Seed Demo Users

In SQL Editor, create your demo users:

```sql
insert into app_users (email, full_name, role) values
  ('admin@returns.local', 'Admin User', 'admin'),
  ('seller1@returns.local', 'Seller One', 'seller'),
  ('seller2@returns.local', 'Seller Two', 'seller'),
  ('processor1@returns.local', 'Processor One', 'processor')
on conflict (email) do nothing;
```

## Phase 2: Configure Your App

### 1. Create Environment File

Create `.env.local` in your project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Replace with your actual values from Step 3 above.

### 2. Install Supabase Client

Already installed in `package.json`, but verify:

```powershell
npm install @supabase/supabase-js
```

### 3. Create Supabase Client Helper

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 4. Update Auth to Use Supabase

Replace `src/lib/auth.ts` to use real Supabase auth instead of localStorage.

### 5. Update Storage to Use Supabase

Replace `src/lib/storage.ts` functions to use Supabase database queries instead of localStorage.

## Phase 3: Deploy Frontend

### Option A: Deploy to Vercel (Recommended)

1. Push your code to GitHub:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/returns-ops.git
   git push -u origin main
   ```

2. Go to [https://vercel.com](https://vercel.com)
3. Click **"Import Project"**
4. Select your GitHub repository
5. Configure:
   - **Framework Preset**: Next.js
   - **Environment Variables**: Add your `.env.local` values
6. Click **"Deploy"**

Your app will be live at `https://returns-ops.vercel.app` (or your custom domain)

### Option B: Deploy to Netlify

1. Push to GitHub (same as above)
2. Go to [https://netlify.com](https://netlify.com)
3. Click **"Add new site"** → **"Import from Git"**
4. Select your repository
5. Build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
6. Add environment variables
7. Click **"Deploy"**

### Option C: Self-Host on Your Server

1. Build the production app:
   ```powershell
   npm run build
   ```

2. Copy these files to your server:
   - `.next/` folder
   - `node_modules/` folder
   - `package.json`
   - `.env.local`

3. On server, run:
   ```bash
   npm install --production
   npm start
   ```

4. Set up reverse proxy (nginx/Apache) to forward port 80/443 to your Next.js port

## Phase 4: Switch from LocalStorage to Supabase

**Important**: This requires code changes to replace localStorage calls with Supabase queries.

I can help you convert the following files:
1. `src/lib/auth.ts` - Use Supabase Auth
2. `src/lib/storage.ts` - Use Supabase database queries
3. Add file upload to scanner page for inspection photos

Would you like me to implement these changes now?

## Cost Estimate (Supabase Free Tier)

- **Database**: 500 MB (enough for ~50,000 package records)
- **Storage**: 1 GB (enough for ~2,000 inspection photos)
- **Bandwidth**: 2 GB/month
- **Auth users**: Unlimited

Upgrade to Pro ($25/month) when you need more resources.

## Security Checklist

- ✅ Environment variables set correctly
- ✅ Service role key never exposed to client
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Storage bucket policies configured
- ✅ HTTPS enabled (automatic on Vercel/Netlify)
- ⚠️ Update allowed redirect URLs in Supabase Auth settings
- ⚠️ Configure CORS if needed for custom domain

## Next Steps

1. Complete Phase 1-2 to get Supabase ready
2. Test with `.env.local` on localhost
3. I can convert the localStorage code to Supabase
4. Deploy frontend to Vercel/Netlify
5. Train your team on the live app

Let me know when you're ready and I'll implement the Supabase integration code changes!
