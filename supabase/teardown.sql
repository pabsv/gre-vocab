-- Removes everything GRE Vocab added to the Life OS project. Life OS itself is untouched.
drop table if exists public.gre_events cascade;
drop table if exists public.gre_meta cascade;
drop function if exists public.gre_events_guard();
drop function if exists public.gre_meta_guard();
