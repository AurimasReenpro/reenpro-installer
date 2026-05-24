-- Add contact person and email to sites table
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS client_email   TEXT;
