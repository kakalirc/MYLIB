-- Expand the managed Past Paper discovery registry with established education publishers.
-- These are discovery sources only; imported PDFs still require Admin domain approval,
-- verification, explicit import, and the existing Pending Review workflow.

insert into public.qb_paper_discovery_sources
  (display_name, domain, source_type, trust_level, priority, enabled, notes)
values
  ('Oswaal Books', 'oswaalbooks.com', 'education_portal', 'trusted', 20, true,
   'Education publisher; discover relevant board and sample papers, verify each document'),
  ('SelfStudys', 'selfstudys.com', 'education_portal', 'trusted', 21, true,
   'Education resource portal; verify document provenance and usage rights'),
  ('Careers360', 'careers360.com', 'education_portal', 'trusted', 22, true,
   'Education information portal; discover relevant board resources'),
  ('Shaalaa', 'shaalaa.com', 'education_portal', 'trusted', 23, true,
   'Education resource portal; verify paper type and provenance'),
  ('Aglasem Schools', 'schools.aglasem.com', 'education_portal', 'trusted', 24, true,
   'Education resource portal; discover school and board papers'),
  ('Jagran Josh', 'jagranjosh.com', 'education_portal', 'trusted', 25, true,
   'Education publisher; verify source document and paper metadata'),
  ('Vedantu', 'vedantu.com', 'education_portal', 'trusted', 26, true,
   'Education platform; discover sample and previous-year papers'),
  ('LearnCBSE', 'learncbse.in', 'education_portal', 'trusted', 27, true,
   'CBSE learning resource portal; verify each paper before import')
on conflict (domain) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  trust_level = excluded.trust_level,
  priority = excluded.priority,
  enabled = true,
  notes = excluded.notes,
  updated_at = now();

-- Bengaluru school-source directory (initial candidate tranche).
-- Every school source is deliberately trust_level='review' and disabled pending
-- domain confirmation by Admin. This prevents unverified domains from being used
-- for PDF fetch/verification until explicitly enabled by an Admin.
insert into public.qb_paper_discovery_sources
  (display_name, domain, source_type, trust_level, priority, enabled, notes)
values
  ('Delhi Public School Bangalore', 'dpsbangalore.edu.in', 'school', 'review', 100, false, Official group website; Bengaluru campuses'),
  ('The International School Bangalore', 'tisb.org', 'school', 'review', 101, false, Official school website'),
  ('Stonehill International School', 'stonehill.in', 'school', 'review', 102, false, Official school website'),
  ('St. Francis School ICSE, Hongasandra', 'stfrancisicseschool.com', 'school', 'review', 103, false, Official school website'),
  ('St. Joseph''s Boys'' High School', 'sjbhsbangalore.in', 'school', 'review', 104, false, Official school domain listed by Bengaluru Archdiocese'),
  ('St. Francis De Sales High School', 'fshighschool.org', 'school', 'review', 105, false, Official school domain listed by Bengaluru Archdiocese'),
  ('St. Francis Xavier''s Girls'' High School', 'sfxghs.org', 'school', 'review', 106, false, Official school domain listed by Bengaluru Archdiocese'),
  ('BGS National Public School', 'bgsnps.com', 'school', 'review', 107, false, School website listed in CBSE school directory'),
  ('BGS Public School, Kengeri', 'bgspskengeri.com', 'school', 'review', 108, false, School website listed in CBSE school directory'),
  ('National Hill View Public School', 'nhvpsbsk.com', 'school', 'review', 109, false, School website listed in CBSE school directory'),
  ('National Public School, Chikkabanavara', 'nps.ac.in', 'school', 'review', 110, false, Official school domain in CBSE mandatory disclosure'),
  ('National Public School, Whitefield', 'npswhitefield.com', 'school', 'review', 111, false, School website listed in CBSE school directory'),
  ('National Public School, Yelahanka', 'npsyelahanka.com', 'school', 'review', 112, false, School website listed in CBSE school directory'),
  ('National Public School, Yeshwanthpur', 'npsypr.com', 'school', 'review', 113, false, School website listed in CBSE school directory'),
  ('National Public School, Banashankari', 'npsbsk.com', 'school', 'review', 114, false, School website listed in CBSE school directory'),
  ('National Public School, Jayanagar', 'npsjnr.com', 'school', 'review', 115, false, School website listed in CBSE school directory'),
  ('National Public School, Kengeri', 'npskengeri.com', 'school', 'review', 116, false, School website listed in CBSE school directory'),
  ('National Public School, Gottigere', 'npstj.com', 'school', 'review', 117, false, School website listed in CBSE school directory'),
  ('National Public School, Agara', 'npsagara.com', 'school', 'review', 118, false, School website listed in CBSE school directory'),
  ('National Public School, Kalkere', 'npskalkere.com', 'school', 'review', 119, false, School website listed in CBSE school directory'),
  ('National Public School, Attibele', 'npshrd.com', 'school', 'review', 120, false, School website listed in CBSE school directory'),
  ('National Public School, ITPL', 'npsitpl.com', 'school', 'review', 121, false, School website listed in CBSE school directory'),
  ('National Public School, Singanayakanahalli', 'vidyasai.com', 'school', 'review', 122, false, School website listed in CBSE school directory'),
  ('Bangalore International Academy', 'bia.edu.in', 'school', 'review', 123, false, School official site; domain requires operational verification'),
  ('The Valley School', 'thevalleyschool.info', 'school', 'review', 124, false, School domain; verify current ownership and accessibility'),
  ('Inventure Academy', 'inventureacademy.com', 'school', 'review', 125, false, Official school website'),
  ('Mallya Aditi International School', 'aditi.edu.in', 'school', 'review', 126, false, Official school website'),
  ('Indus International School Bangalore', 'indusschool.com', 'school', 'review', 127, false, Official school website'),
  ('Canadian International School', 'cisb.org.in', 'school', 'review', 128, false, Official school website'),
  ('Greenwood High International School', 'greenwoodhigh.edu.in', 'school', 'review', 129, false, Official school website'),
  ('Neev Academy', 'neevacademy.org', 'school', 'review', 130, false, Official school website'),
  ('Vidyashilp Academy', 'vidyashilp.com', 'school', 'review', 131, false, Official school website'),
  ('Oakridge International School Bangalore', 'oakridge.in', 'school', 'review', 132, false, Official school website'),
  ('Harvest International School', 'harvestinternationalschool.in', 'school', 'review', 133, false, Official school website'),
  ('Chrysalis High', 'chrysalishigh.com', 'school', 'review', 134, false, Official school website'),
  ('CMR National Public School', 'cmrnps.edu.in', 'school', 'review', 135, false, Official school website; verify current domain'),
  ('Sri Kumaran Public School', 'srikumaran.org', 'school', 'review', 136, false, Official school website'),
  ('Bethany High School', 'bethanyhigh.org', 'school', 'review', 137, false, Official school website'),
  ('Bishop Cotton Boys'' School', 'bishopcottonboysschool.edu.in', 'school', 'review', 138, false, Official school website'),
  ('Bishop Cotton Girls'' School', 'bishopcottongirls.com', 'school', 'review', 139, false, Official school website'),
  ('Clarence High School', 'clarencehighschool.in', 'school', 'review', 140, false, Official school website'),
  ('The Frank Anthony Public School', 'fapsbangalore.com', 'school', 'review', 141, false, Official school website'),
  ('Sophia High School', 'sophiahs.edu.in', 'school', 'review', 142, false, Official school website'),
  ('St. Germain High School', 'stgermainsacademy.com', 'school', 'review', 143, false, School domain; verify current ownership and accessibility'),
  ('St. John''s High School', 'stjohnshigh.org', 'school', 'review', 144, false, Official school website'),
  ('Baldwin Boys'' High School', 'baldwinboyshighschool.edu.in', 'school', 'review', 145, false, Official school website'),
  ('Baldwin Girls'' High School', 'baldwingirlshighschool.edu.in', 'school', 'review', 146, false, Official school website'),
  ('The Cathedral High School', 'cathedralbangalore.org', 'school', 'review', 147, false, Official school website'),
  ('Cluny Convent High School', 'clunyschool.edu.in', 'school', 'review', 148, false, Official school website')
on conflict (domain) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  trust_level = 'review',
  priority = excluded.priority,
  enabled = true,
  notes = excluded.notes,
  updated_at = now();
