-- Modulio galia katalogo įraše.
--
-- Kodėl kataloge, o ne žiniaraščio eilutėje: galia yra prekės savybė. Modulis
-- P7-555-COM visur yra 555 W. Eilutėje ją tektų vesti kiekviename objekte iš
-- naujo, o suklydus viename kiti liktų teisingi ir klaida nepasimatytų.
--
-- Kodėl apskritai reikia: pavadinime galios nėra. Iš 21 katalogo modulio tik
-- 5 turi „W" pavadinime (`Modulis P7-555-COM` neturi), tad seno kodo bandymas
-- ją išlukštenti reguliariuoju reiškiniu duodavo tylią klaidą — dalis modulių
-- tiesiog neįskaičiuojami, o suma atrodo teisinga.
--
-- Talpai naujo stulpelio nereikia: `capacity_kwh` jau yra ir reiškia tą patį —
-- talpa VIENAM vienetui, dauginama iš kiekio objekte.
--
-- Idempotentiška: bazėje migracijų registro nėra.

begin;

alter table equipment_catalog
  add column if not exists power_w numeric;

comment on column equipment_catalog.power_w is
  'Modulio galia vatais VIENAM vienetui. Objekto kWp = suma(power_w * kiekis) / 1000.';

comment on column equipment_catalog.capacity_kwh is
  'Talpa kWh VIENAM vienetui. Objekto kWh = suma(capacity_kwh * kiekis).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.equipment_catalog'::regclass
      and conname = 'equipment_catalog_power_w_chk'
  ) then
    alter table equipment_catalog
      add constraint equipment_catalog_power_w_chk check (power_w is null or power_w > 0);
  end if;
end $$;

commit;
