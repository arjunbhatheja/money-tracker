-- Money tracker schema. The app talks to these tables only from the server
-- with the service role key. RLS is enabled with no policies, so the public
-- anon key can read nothing.

create table if not exists items (
  id               text primary key,          -- Plaid item_id
  institution      text,
  access_token_enc text not null,             -- AES-256-GCM encrypted
  cursor           text,                      -- /transactions/sync cursor
  status           text default 'ok',
  last_error       text,
  last_synced_at   timestamptz,
  created_at       timestamptz default now()
);

create table if not exists accounts (
  id            text primary key,             -- Plaid account_id
  item_id       text references items(id) on delete cascade,
  name          text,
  official_name text,
  mask          text,
  type          text,                         -- depository | credit | investment | loan
  subtype       text,
  current       numeric,
  available     numeric,
  credit_limit  numeric,
  iso_currency  text,
  updated_at    timestamptz default now()
);

create table if not exists transactions (
  id                text primary key,         -- Plaid transaction_id
  account_id        text,
  item_id           text references items(id) on delete cascade,
  date              date,
  authorized_date   date,
  name              text,
  merchant_name     text,
  amount            numeric,                  -- positive = money out
  category_primary  text,
  category_detailed text,
  pending           boolean default false,
  payment_channel   text,
  updated_at        timestamptz default now()
);

create index if not exists transactions_date_idx on transactions (date desc);
create index if not exists transactions_account_idx on transactions (account_id);

alter table items        enable row level security;
alter table accounts     enable row level security;
alter table transactions enable row level security;
