# Make QR ordering work on Vercel

The customer menu is available at `/table/1` through `/table/15`. The QR images on the Tables page are generated from the current deployed domain, so the old QR images in `public/qr` are not used anymore.

## 1. Create the cloud orders table

1. Open your Supabase project and go to **SQL Editor → New query**.
2. Paste and run this SQL:

```sql
create table if not exists public.orders (
  id text primary key,
  table_no integer not null default 1,
  customer text not null default 'Table Guest',
  phone text default '',
  method text not null default 'cash',
  payment text not null default 'Cash',
  payment_status text not null default 'Pending',
  status text not null default 'New',
  note text default '',
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb
);

alter table public.orders enable row level security;

-- DEMO ONLY: allows customer phones and staff screens to create/read/update orders
-- using the public anon key. Add proper staff authentication and stricter policies
-- before using this for a public production restaurant.
drop policy if exists "demo read orders" on public.orders;
drop policy if exists "demo insert orders" on public.orders;
drop policy if exists "demo update orders" on public.orders;
create policy "demo read orders" on public.orders for select to anon, authenticated using (true);
create policy "demo insert orders" on public.orders for insert to anon, authenticated with check (true);
create policy "demo update orders" on public.orders for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.orders to anon, authenticated;
```

## 2. Add Supabase keys to Vercel

In Supabase open **Project Settings → API** (or **API Keys**). Copy the Project URL and the publishable/anon public key.

In Vercel open your project → **Settings → Environment Variables** and add:

- `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase publishable/anon key

Select **Production**, **Preview**, and **Development** as needed, save, then redeploy the project. Do not put a `service_role` or secret key in a `NEXT_PUBLIC_` variable.

## 3. Test after deployment

1. Open `https://YOUR-VERCEL-DOMAIN/table/1` on a phone. The menu should load.
2. Add an item, checkout, and confirm the order.
3. Open `https://YOUR-VERCEL-DOMAIN/kitchen` or `/pos` on another device. The order should appear there.
4. Open `/tables` on the deployed website and scan the newly generated QR code. Do not use the older QR PDF/PNG files; they contain the previous demo URL.

## Important

The local JSON file is only a local-development fallback. Vercel's serverless filesystem is not persistent, so cloud orders require the Supabase setup above. The checkout now displays an error instead of falsely claiming an order succeeded when the database save fails.
