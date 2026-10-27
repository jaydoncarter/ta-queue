# COMP 1010 TA Queue

A small, responsive office-hours queue for COMP 1010. Students can join the queue and see live updates; authenticated TAs can take, return, or remove requests.

## Features

- Student queue form with validation, clear success/error feedback, and self-removal from the same browser.
- Live queue updates through Supabase Realtime database changes.
- Elapsed wait time, queue position, status, and the TA currently helping each student.
- Supabase email/password sign-in for TAs.
- Live “TAs currently on duty” roster using Supabase Realtime Presence.
- Browser notifications for new queue entries after permission is granted.
- Responsive layout for desktop and mobile.

## Requirements

- Node.js 20 or later
- A Supabase project with email/password and anonymous sign-ins enabled
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

3. In Supabase **Authentication → Providers**, enable **Anonymous Sign-Ins**. The app uses this private browser identity so a student can remove only their own entry.

4. Apply the included migrations for TA names and student-owned entries:

   ```bash
   supabase db push
   ```

   Or run both files in `supabase/migrations/` in the Supabase SQL Editor.

5. Start the development server:

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
| `student_id` | Anonymous or authenticated student identity that owns the entry |
| `created_at` | Timestamp used to order the queue and show wait time |

The migrations add `ta_name`, `student_id`, and restrictive RLS policies for student-owned inserts and deletes. Existing projects must apply them before TAs can use **Start helping** or students can use **Remove myself**.

Enable Realtime replication for `queue_entries` in Supabase so queue changes appear immediately. The on-duty roster uses Realtime Presence and does not require a separate table.

## Browser notifications

The app asks for browser-notification permission when a visitor joins the queue or a TA signs in. After permission is granted, every open app page that has also been granted permission receives a **Student joined the queue** notification for new entries. Notifications require HTTPS in production (or `localhost` during development).

## Authorization

The browser only uses the Supabase publishable key. Database Row Level Security is the source of truth for authorization:

- Allow students/public users to read the queue. The included migration permits authenticated anonymous students to insert and delete only rows whose `student_id` is their own `auth.uid()`.
- Limit updates and deletes to authenticated TA accounts through your RLS policies.
- Do not implement TA-email allowlists in the frontend.

The UI hides TA actions when signed out; the database must still reject unauthorized writes.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run deploy` | Build and publish to the configured GitHub Pages site |
