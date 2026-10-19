ALTER TABLE contacts
  ADD COLUMN ad_id TEXT,
  ADD COLUMN ad_referral JSONB;

CREATE INDEX IF NOT EXISTS idx_contacts_ad_id ON contacts(ad_id) WHERE ad_id IS NOT NULL;