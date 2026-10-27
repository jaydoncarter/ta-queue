# COMP 1010 TA Queue

A small, responsive office-hours queue for COMP 1010. Students can join the queue and see live updates; authenticated TAs can take, return, or remove requests.

## Features

- Student queue form with validation and clear success/error feedback.
- Live queue updates through Supabase Realtime database changes.
- Elapsed wait time, queue position, status, and the TA currently helping each student.
- Supabase email/password sign-in for TAs.
- Live “TAs currently on duty” roster using Supabase Realtime Presence.
- Responsive layout for desktop and mobile.

## Requirements

- Node.js 20 or later
- A Supabase project with email/password authentication enabled
- A `queue_entries` table and Row Level Security policies appropriate for your course

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and add your project’s public credentials:

   ```bash
   cp .env.example .env
   ```

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

   Never put a Supabase service-role key in `.env` files used by Vite or in frontend code.

3. Apply the included migration so TA names can be stored with active queue entries:

   ```bash
   supabase db push
   ```

   Or run [supabase/migrations/20261027000000_add_ta_name_to_queue_entries.sql](supabase/migrations/20261027000000_add_ta_name_to_queue_entries.sql) in the Supabase SQL Editor.

4. Start the development server:

   ```bash
   npm run dev
   ```

## Database expectations

The app reads and writes `public.queue_entries` with these fields:

| Column | Purpose |
| --- | --- |
| `id` | Unique entry identifier |
| `student_name` | Student’s display name |
| `question` | Help request |
| `status` | `waiting` or `helping` |
| `ta_name` | Nullable name of the TA helping the student |
| `created_at` | Timestamp used to order the queue and show wait time |

The current migration adds `ta_name`. Existing projects must run it before a TA can use **Start helping**.

Enable Realtime replication for `queue_entries` in Supabase so queue changes appear immediately. The on-duty roster uses Realtime Presence and does not require a separate table.

## Authorization

The browser only uses the Supabase publishable key. Database Row Level Security is the source of truth for authorization:

- Allow students/public users to read the queue and insert waiting entries as desired.
- Limit updates and deletes to authenticated TA accounts through your RLS policies.
- Do not implement TA-email allowlists in the frontend.

The UI hides TA actions when signed out; the database must still reject unauthorized writes.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run deploy` | Build and publish to the configured GitHub Pages site |
