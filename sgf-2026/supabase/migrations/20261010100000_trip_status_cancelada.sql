-- Viagens imutaveis, parte 1/2: novo valor do enum trip_status.
-- ALTER TYPE ... ADD VALUE nao pode ser usado na mesma transacao em que o
-- valor e criado; por isso esta migration fica SOZINHA e a
-- 20261010100100_trip_immutability.sql (que usa 'cancelada') roda depois.
alter type public.trip_status add value if not exists 'cancelada';
