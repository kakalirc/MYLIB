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

