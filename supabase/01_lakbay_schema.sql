-- LAKBAY Step 21. Run once in a new Supabase project's SQL Editor.
-- Imported records are PRIVATE pending review; publicly viewable only when approved.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
set search_path to public, extensions;

create table if not exists public.lakbay_areas (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  kind text not null check (kind in ('province','city','municipality','locality','metro')),
  province text,
  latitude double precision not null check (latitude between 4 and 22),
  longitude double precision not null check (longitude between 115 and 130),
  south double precision not null,
  west double precision not null,
  north double precision not null,
  east double precision not null,
  classification_verified boolean not null default false,
  data_source text not null default 'geoBoundaries',
  created_at timestamptz not null default now()
);
create index if not exists lakbay_areas_name_trgm on public.lakbay_areas using gin (name gin_trgm_ops);
create index if not exists lakbay_areas_parent on public.lakbay_areas (province,kind);

create table if not exists public.lakbay_destinations (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  slug text not null unique,
  name text not null,
  alternate_names text[] not null default '{}'::text[],
  province text not null,
  city text,
  category text not null check (category in ('Nature','Beach','History','Culture','Adventure','Food')),
  description text,
  latitude double precision not null check (latitude between 4 and 22),
  longitude double precision not null check (longitude between 115 and 130),
  wikidata_id text,
  osm_type text,
  osm_id bigint,
  source_name text not null,
  source_url text not null,
  source_license text,
  source_tags jsonb not null default '{}'::jsonb,
  cover_url text,
  cover_source_url text,
  cover_creator text,
  cover_license text,
  cover_license_url text,
  photo_checked_at timestamptz,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lakbay_destinations_name_trgm on public.lakbay_destinations using gin(name gin_trgm_ops);
create index if not exists lakbay_destinations_geo on public.lakbay_destinations(latitude,longitude);
create index if not exists lakbay_destinations_province on public.lakbay_destinations(province, review_status);
create index if not exists lakbay_destinations_status on public.lakbay_destinations(review_status);

create table if not exists public.lakbay_photos (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.lakbay_destinations(id) on delete cascade,
  photo_url text not null,
  source_url text not null,
  caption text,
  photographer text,
  license text not null,
  license_url text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(destination_id,source_url)
);
create index if not exists lakbay_photos_destination on public.lakbay_photos(destination_id,review_status);

-- Tables reserved for the later sign-in, admin and community-submission phases.
create table if not exists public.lakbay_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.lakbay_wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.lakbay_destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,destination_id)
);
create table if not exists public.lakbay_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_name text not null,
  description text,
  latitude double precision check(latitude between 4 and 22),
  longitude double precision check(longitude between 115 and 130),
  image_urls jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.lakbay_areas enable row level security;
alter table public.lakbay_destinations enable row level security;
alter table public.lakbay_photos enable row level security;
alter table public.lakbay_profiles enable row level security;
alter table public.lakbay_wishlists enable row level security;
alter table public.lakbay_submissions enable row level security;

-- Least privilege: no public INSERT/UPDATE/DELETE on imported records.
revoke all on public.lakbay_areas, public.lakbay_destinations, public.lakbay_photos,
 public.lakbay_profiles, public.lakbay_wishlists, public.lakbay_submissions from anon, authenticated;
grant select on public.lakbay_areas, public.lakbay_destinations, public.lakbay_photos to anon, authenticated;
grant select on public.lakbay_profiles,public.lakbay_wishlists,public.lakbay_submissions to authenticated;
grant insert,delete on public.lakbay_wishlists to authenticated;
grant insert on public.lakbay_submissions to authenticated;

-- Protect unpublished candidate locations from public visibility.
create policy "Public area directory" on public.lakbay_areas for select to anon, authenticated using (true);
create policy "Public verified destinations" on public.lakbay_destinations for select to anon, authenticated using (review_status='approved');
create policy "Public verified photographs" on public.lakbay_photos for select to anon, authenticated using (
  review_status='approved' and exists (
    select 1 from public.lakbay_destinations d where d.id = destination_id and d.review_status = 'approved'
  )
);
create policy "Profile owner read" on public.lakbay_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy "Wishlist owner read" on public.lakbay_wishlists for select to authenticated using (user_id=(select auth.uid()));
create policy "Wishlist owner insert" on public.lakbay_wishlists for insert to authenticated with check (user_id=(select auth.uid()));
create policy "Wishlist owner delete" on public.lakbay_wishlists for delete to authenticated using (user_id=(select auth.uid()));
create policy "Submission owner read" on public.lakbay_submissions for select to authenticated using (user_id=(select auth.uid()));
create policy "Submission owner insert" on public.lakbay_submissions for insert to authenticated with check (
  user_id=(select auth.uid()) and review_status='pending'
);

-- Search works for guests, respects destination RLS, and returns ranked names.
create or replace function public.lakbay_search_places(q text, result_limit integer default 15)
returns setof public.lakbay_destinations
language sql stable security invoker set search_path = public, extensions as $$
  select d.* from public.lakbay_destinations d
  where d.review_status = 'approved'
    and length(trim(coalesce(q,''))) between 2 and 100
    and (
      d.name ilike '%' || trim(q) || '%'
      or d.province ilike '%' || trim(q) || '%'
      or coalesce(d.city,'') ilike '%' || trim(q) || '%'
      or exists (select 1 from unnest(d.alternate_names) as alt(alias_name) where alt.alias_name ilike '%' || trim(q) || '%')
    )
  order by case when lower(d.name)=lower(trim(q)) then 0
                when lower(d.name) like lower(trim(q))||'%' then 1 else 2 end,
    similarity(d.name,trim(q)) desc, d.name
  limit greatest(1,least(coalesce(result_limit,15),30));
$$;
create or replace function public.lakbay_search_areas(q text, result_limit integer default 12)
returns setof public.lakbay_areas
language sql stable security invoker set search_path=public, extensions as $$
  select a.* from public.lakbay_areas a
  where length(trim(coalesce(q,''))) between 2 and 100
    and (a.name ilike '%'||trim(q)||'%' or coalesce(a.province,'') ilike '%'||trim(q)||'%')
  order by case when lower(a.name)=lower(trim(q)) then 0
                when lower(a.name) like lower(trim(q))||'%' then 1 else 2 end,
    similarity(a.name,trim(q)) desc, a.name
  limit greatest(1,least(coalesce(result_limit,12),30));
$$;
revoke all on function public.lakbay_search_places(text,integer), public.lakbay_search_areas(text,integer) from public;
grant execute on function public.lakbay_search_places(text,integer), public.lakbay_search_areas(text,integer) to anon, authenticated;

-- Reviewer action example, run manually in SQL Editor after checking a place:
-- update public.lakbay_destinations set review_status='approved',reviewed_at=now()
-- where id='PASTE-REVIEWED-UUID';
-- update public.lakbay_photos set review_status='approved'
-- where destination_id='PASTE-REVIEWED-UUID' and source_url='VERIFIED-COMMONS-URL';
