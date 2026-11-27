# Marquee 1 – Multi-Hall Management System (Karachi, Pakistan)

A production-quality, bilingual (**English & Urdu RTL** with `Noto Nastaliq Urdu`) multi-hall banquet management platform built with **React, Vite, TypeScript, Tailwind CSS, and Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions)**.

## Key Features
- **Bilingual UI (English + Urdu RTL) + Light/Dark Themes**: Instant language toggle with full RTL layout and `Noto Nastaliq Urdu`, plus Dark (neon) and Light themes. Invoices always print in light A4 colors and 80mm receipts print black-on-white.
- **Multi-Hall Architecture**: Manage multiple halls (`Marquee 1`, etc.) with isolated data, per-hall prefixes (`MQ1-YYYY-0001`, `INV-YYYY-0001`, `RCP-YYYY-0001`), and a top-bar **Hall Switcher** for Super Admin.
- **Flexible Per-User, Per-Screen Permissions (UI + Edge Function + PostgreSQL RLS)**:
  - Covers all **19 screens**: `dashboard`, `calendar`, `bookings`, `customers`, `payments`, `daily_closing`, `catalog`, `expenses`, `employees`, `attendance`, `salaries`, `reports`, `invoices`, `reminders`, `users`, `settings`, `recycle_bin`, `audit_log`, `backup_import`.
  - Each screen has separate **View**, **Edit** (create/update), and **Delete** permissions stored in `public.user_permissions(user_id, hall_id, screen_key, can_view, can_edit, can_delete)`.
  - **Roles (`super_admin`, `admin`, `manager`)** act as **default permission templates** when creating a user (with **Delete OFF by default** for everyone except `super_admin`), and every checkbox can be freely customized during creation or later via **Users → Edit & Permissions**.
  - **Database-Level Security**: `public.has_permission(screen_key, action)` is enforced directly inside Supabase RLS policies on every business table alongside `can_access_hall(hall_id)`.
  - **Admin Delegation Rule**: A Hall `admin` can only grant permissions they personally hold, only to `manager` accounts in their own hall, and cannot edit their own permissions or any `admin`/`super_admin` account. All permission edits are recorded in `audit_logs`.
- **Daily Cash Closing**: Managers submit itemized Cash vs. Online collections per booking; Hall Admins mark closings as **Received** or **Flagged** with discrepancy notes.
- **Floor Scheduling & Double-Booking Prevention**: First, Second, Third, and Full Hall (conflicts with every floor), configurable cleaning buffer, and midnight crossover handling enforced both in UI and PostgreSQL triggers (`check_booking_overlap`).

---

## Deployment Guide (Supabase + Edge Function + GitHub + Vercel)

### 1. Create a Free Supabase Project & Run Schema (or Upgrade Existing Project)
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in your Supabase Dashboard.
3. **Fresh install**: Copy the entire contents of `supabase/schema.sql` and run it. This creates all multi-hall tables, `user_permissions`, `has_permission(...)` RLS policies, sequences, overlap triggers, and seed data for **Marquee 1** (`11111111-1111-4111-8111-111111111101`).
4. **Upgrading an existing project**: Copy and run `supabase/migrations/20261127_user_permissions.sql` in SQL Editor. This safely creates `public.user_permissions` and `public.has_permission(...)`, backfills default permissions for existing users (preserving unrestricted access for `super_admin`), and replaces all table RLS policies idempotently.
5. Go to **Authentication → Users** in Supabase and create your initial Super Admin user (email + password).
6. Copy that user's UUID and insert their profile in SQL Editor:
   ```sql
   INSERT INTO public.profiles (id, hall_id, full_name, email, phone, role, is_active)
   VALUES ('YOUR-USER-UUID', '11111111-1111-4111-8111-111111111101', 'Super Admin', 'superadmin@marquee1.pk', '0300-2198844', 'super_admin', true)
   ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
   ```

### 2. Deploy / Update the `manage-users` Edge Function
Because creating Supabase Auth accounts, saving custom `user_permissions`, and resetting passwords requires `SUPABASE_SERVICE_ROLE_KEY`, it runs safely inside `supabase/functions/manage-users/index.ts` on Supabase servers — **never** put your service role key in Vercel or `.env`.

Run these commands in your project folder (Supabase CLI automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions):
```bash
# 1. Log in to Supabase CLI
npx supabase login

# 2. Link this folder to your Supabase project (find your Reference ID in Supabase Dashboard → Project Settings → General)
npx supabase link --project-ref YOUR_PROJECT_REF

# 3. Deploy the manage-users Edge Function
npx supabase functions deploy manage-users
```
Once deployed, `super_admin` and authorized `admin` users can create staff, customize per-screen View/Edit/Delete permissions, deactivate accounts, and reset passwords directly from the **Users** screen.

### 3. Local Development
```bash
npm install
cp .env.example .env
# Add VITE_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```
> **Note:** If Supabase URL or key are left unset, the login screen displays `"Supabase environment variables are missing"` and runs in local browser preview mode with pre-seeded data persisted in `localStorage`.

### 4. Deploy to Vercel from GitHub
1. Push this repository to GitHub.
2. Import the repository in [vercel.com](https://vercel.com).
3. Add **only** the public browser Environment Variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
   - `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - *(Optional)* `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for direct server-side invoice emails via `/api/send-email` (the app works completely without them, falling back to `mailto:`).
4. Click **Deploy** (Build Command: `npm run build`, Output Directory: `dist`).

### 5. Google Sheets Sync (Optional)
See `supabase/google-apps-script.js` for an Apps Script template you can attach to a Google Sheet, or export your Google Sheet as `.csv` / `.xlsx` and upload it directly on the **Import Sheets** screen.
