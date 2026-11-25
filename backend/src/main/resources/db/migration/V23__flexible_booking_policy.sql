SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.booking_violations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.booking_violations (
        class_id INT NOT NULL REFERENCES dbo.classes(class_id),
        member_id INT NOT NULL REFERENCES dbo.users(user_id),
        kind VARCHAR(15) NOT NULL CHECK (kind IN ('LATE_CANCEL', 'NO_SHOW')),
        recorded_at DATETIME2 NOT NULL,
        consumed_at DATETIME2 NULL,
        restriction_until DATETIME2 NULL,
        excused_at DATETIME2 NULL,
        excused_by INT NULL REFERENCES dbo.users(user_id),
        PRIMARY KEY (class_id, member_id)
    );
    CREATE INDEX IX_booking_violations_member ON dbo.booking_violations(member_id, recorded_at);
END;

IF OBJECT_ID('dbo.class_waitlist', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.class_waitlist (
        id INT IDENTITY PRIMARY KEY,
        class_id INT NOT NULL REFERENCES dbo.classes(class_id),
        member_id INT NOT NULL REFERENCES dbo.users(user_id),
        joined_at DATETIME2 NOT NULL,
        invite_until DATETIME2 NULL,
        status VARCHAR(12) NOT NULL CHECK (status IN ('QUEUED','INVITED','EXPIRED','ACCEPTED','CANCELLED')),
        CONSTRAINT UQ_class_waitlist_class_member UNIQUE (class_id,member_id)
    );
    CREATE INDEX IX_class_waitlist_queue ON dbo.class_waitlist(class_id,status,joined_at,id);
END;

COMMIT TRANSACTION;
