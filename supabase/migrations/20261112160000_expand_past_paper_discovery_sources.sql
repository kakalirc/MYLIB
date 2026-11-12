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
-- Every school source is deliberately trust_level='review' but enabled temporarily at the user's request for testing. They remain
-- trust_level='review'; test results must not be treated as paper endorsement.
insert into public.qb_paper_discovery_sources
  (display_name, domain, source_type, trust_level, priority, enabled, notes)
values
  ('Delhi Public School Bangalore', 'dpsbangalore.edu.in', 'school', 'review', 100, true, 'Official group website; Bengaluru campuses'),
  ('The International School Bangalore', 'tisb.org', 'school', 'review', 101, true, 'Official school website'),
  ('Stonehill International School', 'stonehill.in', 'school', 'review', 102, true, 'Official school website'),
  ('St. Francis School ICSE, Hongasandra', 'stfrancisicseschool.com', 'school', 'review', 103, true, 'Official school website'),
  ('St. Joseph''s Boys'' High School', 'sjbhsbangalore.in', 'school', 'review', 104, true, 'Official school domain listed by Bengaluru Archdiocese'),
  ('St. Francis De Sales High School', 'fshighschool.org', 'school', 'review', 105, true, 'Official school domain listed by Bengaluru Archdiocese'),
  ('St. Francis Xavier''s Girls'' High School', 'sfxghs.org', 'school', 'review', 106, true, 'Official school domain listed by Bengaluru Archdiocese'),
  ('BGS National Public School', 'bgsnps.com', 'school', 'review', 107, true, 'School website listed in CBSE school directory'),
  ('BGS Public School, Kengeri', 'bgspskengeri.com', 'school', 'review', 108, true, 'School website listed in CBSE school directory'),
  ('National Hill View Public School', 'nhvpsbsk.com', 'school', 'review', 109, true, 'School website listed in CBSE school directory'),
  ('National Public School, Chikkabanavara', 'nps.ac.in', 'school', 'review', 110, true, 'Official school domain in CBSE mandatory disclosure'),
  ('National Public School, Whitefield', 'npswhitefield.com', 'school', 'review', 111, true, 'School website listed in CBSE school directory'),
  ('National Public School, Yelahanka', 'npsyelahanka.com', 'school', 'review', 112, true, 'School website listed in CBSE school directory'),
  ('National Public School, Yeshwanthpur', 'npsypr.com', 'school', 'review', 113, true, 'School website listed in CBSE school directory'),
  ('National Public School, Banashankari', 'npsbsk.com', 'school', 'review', 114, true, 'School website listed in CBSE school directory'),
  ('National Public School, Jayanagar', 'npsjnr.com', 'school', 'review', 115, true, 'School website listed in CBSE school directory'),
  ('National Public School, Kengeri', 'npskengeri.com', 'school', 'review', 116, true, 'School website listed in CBSE school directory'),
  ('National Public School, Gottigere', 'npstj.com', 'school', 'review', 117, true, 'School website listed in CBSE school directory'),
  ('National Public School, Agara', 'npsagara.com', 'school', 'review', 118, true, 'School website listed in CBSE school directory'),
  ('National Public School, Kalkere', 'npskalkere.com', 'school', 'review', 119, true, 'School website listed in CBSE school directory'),
  ('National Public School, Attibele', 'npshrd.com', 'school', 'review', 120, true, 'School website listed in CBSE school directory'),
  ('National Public School, ITPL', 'npsitpl.com', 'school', 'review', 121, true, 'School website listed in CBSE school directory'),
  ('National Public School, Singanayakanahalli', 'vidyasai.com', 'school', 'review', 122, true, 'School website listed in CBSE school directory'),
  ('Bangalore International Academy', 'bia.edu.in', 'school', 'review', 123, true, 'School official site; domain requires operational verification'),
  ('The Valley School', 'thevalleyschool.info', 'school', 'review', 124, true, 'School domain; verify current ownership and accessibility'),
  ('Inventure Academy', 'inventureacademy.com', 'school', 'review', 125, true, 'Official school website'),
  ('Mallya Aditi International School', 'aditi.edu.in', 'school', 'review', 126, true, 'Official school website'),
  ('Indus International School Bangalore', 'indusschool.com', 'school', 'review', 127, true, 'Official school website'),
  ('Canadian International School', 'cisb.org.in', 'school', 'review', 128, true, 'Official school website'),
  ('Greenwood High International School', 'greenwoodhigh.edu.in', 'school', 'review', 129, true, 'Official school website'),
  ('Neev Academy', 'neevacademy.org', 'school', 'review', 130, true, 'Official school website'),
  ('Vidyashilp Academy', 'vidyashilp.com', 'school', 'review', 131, true, 'Official school website'),
  ('Oakridge International School Bangalore', 'oakridge.in', 'school', 'review', 132, true, 'Official school website'),
  ('Harvest International School', 'harvestinternationalschool.in', 'school', 'review', 133, true, 'Official school website'),
  ('Chrysalis High', 'chrysalishigh.com', 'school', 'review', 134, true, 'Official school website'),
  ('CMR National Public School', 'cmrnps.edu.in', 'school', 'review', 135, true, 'Official school website; verify current domain'),
  ('Sri Kumaran Public School', 'srikumaran.org', 'school', 'review', 136, true, 'Official school website'),
  ('Bethany High School', 'bethanyhigh.org', 'school', 'review', 137, true, 'Official school website'),
  ('Bishop Cotton Boys'' School', 'bishopcottonboysschool.edu.in', 'school', 'review', 138, true, 'Official school website'),
  ('Bishop Cotton Girls'' School', 'bishopcottongirls.com', 'school', 'review', 139, true, 'Official school website'),
  ('Clarence High School', 'clarencehighschool.in', 'school', 'review', 140, true, 'Official school website'),
  ('The Frank Anthony Public School', 'fapsbangalore.com', 'school', 'review', 141, true, 'Official school website'),
  ('Sophia High School', 'sophiahs.edu.in', 'school', 'review', 142, true, 'Official school website'),
  ('St. Germain High School', 'stgermainsacademy.com', 'school', 'review', 143, true, 'School domain; verify current ownership and accessibility'),
  ('St. John''s High School', 'stjohnshigh.org', 'school', 'review', 144, true, 'Official school website'),
  ('Baldwin Boys'' High School', 'baldwinboyshighschool.edu.in', 'school', 'review', 145, true, 'Official school website'),
  ('Baldwin Girls'' High School', 'baldwingirlshighschool.edu.in', 'school', 'review', 146, true, 'Official school website'),
  ('The Cathedral High School', 'cathedralbangalore.org', 'school', 'review', 147, true, 'Official school website'),
  ('Cluny Convent High School', 'clunyschool.edu.in', 'school', 'review', 148, true, 'Official school website')
on conflict (domain) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  trust_level = 'review',
  priority = excluded.priority,
  enabled = true,
  notes = excluded.notes,
  updated_at = now();
