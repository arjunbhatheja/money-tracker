-- Manual categories, notes, review state, and merchant rules.

alter table transactions
  add column if not exists bucket_override text,
  add column if not exists note text,
  add column if not exists reviewed_at timestamptz;

create table if not exists rules (
  id         bigserial primary key,
  match      text not null,          -- case-insensitive text in merchant/description
  bucket     text not null,          -- food | yourself | bills | india | big_purchase | savings | income | ignore
  note       text,
  created_at timestamptz default now()
);
create unique index if not exists rules_match_idx on rules (lower(match));
alter table rules enable row level security;

insert into rules (match, bucket, note) values
  ('anthropic', 'bills', 'Claude subscription'),
  ('geico', 'bills', 'Car insurance'),
  ('lemonade', 'bills', 'Renter''s insurance')
on conflict do nothing;
