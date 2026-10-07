-- Preserve existing policy as individual rules; new doctors need explicit configuration.
INSERT OR IGNORE INTO earning_rules (doctor_id,mode,value,updated_at,updated_by)
SELECT u.id,r.mode,r.value,r.updated_at,r.updated_by FROM users u
CROSS JOIN earning_rules r WHERE r.doctor_id='*' AND u.role IN ('doctor','admin');
--> statement-breakpoint
DELETE FROM earning_rules WHERE doctor_id='*';
