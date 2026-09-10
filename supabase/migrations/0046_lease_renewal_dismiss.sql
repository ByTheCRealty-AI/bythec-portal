alter table properties add column if not exists renewal_dismissed_for date;
comment on column properties.renewal_dismissed_for is 'Overview lease-renewal: rental_end que a Andrea descartou. Aviso esconde enquanto renewal_dismissed_for = rental_end.';
