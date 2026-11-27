# Marquee 1 – Hall Management System (Karachi, Pakistan)

A production-quality, bilingual (**English & Urdu RTL** with `Noto Nastaliq Urdu`) banquet hall management platform built with **React, Vite, TypeScript, Tailwind CSS, and Supabase (PostgreSQL + Auth + Row Level Security)**.

## Key Features
- **Bilingual UI (English + Urdu RTL)**: Instant language toggle with full RTL layout and `Noto Nastaliq Urdu` typography.
- **Role-Based Access Control (Supabase Auth + RLS)**:
  - `super_admin`: Full control, user & role management, catalog/categories, settings, recycle bin restore, and audit log.
  - `management`: Create/edit bookings, manage customers, view calendar, handle crate quantities.
  - `finance`: Record payments & installments, manage expenses, monthly/daily-wage staff payouts, financial reports, and invoices.
- **Floor Scheduling & Double-Booking Prevention**: First, Second, Third, and Full Hall (conflicts with every floor). Enforced both in the UI and at the PostgreSQL trigger level (`check_booking_overlap`).
- **Auto-Sequenced Booking & Invoice Numbers**: Never-reused database sequences (`MQ1-YYYY-0001`, `INV-YYYY-0001`, `RCP-YYYY-0001`).
- **Cold Drink Crate Reversal Math**: Automatically credits returned crates after deducting ice and handling expenses per crate.
- **Bilingual Official PDF Invoices & Receipts**: Print-ready A4 Urdu + English invoices and payment receipts, plus one-click **WhatsApp** (`wa.me`) and **Email** (`mailto:` or optional Resend API) sharing.
- **Data Import & Full Backup**: Map CSV/Excel exports from Google Sheets to booking records with preview & validation, plus one-click JSON/Excel full backup.

---

## Deployment Guide (Supabase + GitHub + Vercel)

### 1. Create a Free Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in your Supabase Dashboard.
3. Copy the entire contents of `supabase/schema.sql` and run it. This creates all tables, sequences, overlap triggers, RLS policies, and Karachi sample seed data.
4. Go to **Authentication → Users** in Supabase and create your initial Super Admin user (email + password).
5. Copy that user's UUID and insert their profile in SQL Editor:
   ```sql
   INSERT INTO public.profiles (id, full_name, email, phone, role)
   VALUES ('YOUR-USER-UUID', 'Super Admin', 'admin@marquee1.pk', '0300-2198844', 'super_admin');
   ```
   After this first user is created, `super_admin` can manage additional users and roles directly from the **Users & Roles** screen.

### 2. Local Development
```bash
npm install
cp .env.example .env
# Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase Settings -> API
npm run dev
```
> **Note:** If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are left unset, the application runs in local browser preview mode with pre-seeded data persisted in `localStorage` so every screen and role can be evaluated immediately.

### 3. Deploy to Vercel from GitHub
1. Push this repository to GitHub.
2. Import the repository in [vercel.com](https://vercel.com).
3. Add Environment Variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - *(Optional)* `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for direct server-side invoice emails via `/api/send-email`.
4. Click **Deploy** (Build Command: `npm run build`, Output Directory: `dist`).

### 4. Google Sheets Sync (Optional)
See `supabase/google-apps-script.js` for an Apps Script template you can attach to a Google Sheet, or export your Google Sheet as `.csv` / `.xlsx` and upload it directly on the **Import** screen.
