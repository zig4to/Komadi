-- "Popravi skladbe": opis prijave napake je mogoče urediti na strani
-- "Popravi skladbe" (gumb s svinčnikom desno od opisa), zato tabela
-- song_reports potrebuje še update politiko (0018 je imela samo
-- select/insert/delete).
create policy "Public update song reports" on public.song_reports
  for update using (true) with check (true);
