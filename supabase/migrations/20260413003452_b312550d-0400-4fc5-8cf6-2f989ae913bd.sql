-- Add soft delete columns to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Add soft delete columns to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Add soft delete columns to change_requests
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Add soft delete columns to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at timestamptz;