SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.recurring_class_sessions', 'U') IS NULL
    CREATE TABLE dbo.recurring_class_sessions (
        recurrence_key VARCHAR(64) NOT NULL,
        session_date DATE NOT NULL,
        class_id INT NOT NULL REFERENCES dbo.classes(class_id),
        PRIMARY KEY (recurrence_key, session_date),
        CONSTRAINT UQ_recurring_class_session UNIQUE(class_id)
    );

COMMIT TRANSACTION;
