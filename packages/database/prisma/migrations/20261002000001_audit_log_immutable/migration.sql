-- Create trigger function to make AuditLog append-only
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only: UPDATE and DELETE operations are not permitted on table AuditLog';
END;
$$ LANGUAGE plpgsql;

-- Attach trigger for UPDATE and DELETE
DROP TRIGGER IF EXISTS trigger_audit_log_immutable ON "AuditLog";
CREATE TRIGGER trigger_audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
