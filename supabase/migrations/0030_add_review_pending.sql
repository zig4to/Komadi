-- "Pregled in odobritev": skladbe, ki jih doda skill dodaj-iz-cakalne-vrste,
-- najprej čakajo na pregled (review_pending = true) in se v knjižnici
-- ("Vsi Komadi", Novo, Popularno, Skupno ...) pokažejo šele, ko jih
-- uporabnik na strani "Pregled in odobritev" odobri.
alter table public.songs
  add column if not exists review_pending boolean not null default false;
