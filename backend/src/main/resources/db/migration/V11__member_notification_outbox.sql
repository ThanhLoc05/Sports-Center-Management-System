-- ME09: durable logical notification identity and bounded SSE publication retry.
-- Apply after V9/V10 to an approved database. Does not modify existing history.
SET XACT_ABORT ON;
IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
 THROW 51040,'Select an approved project database',1;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.member_notification_outbox') IS NOT NULL
  THROW 51041,'ME09 outbox already exists; verify migration history',1;
 CREATE TABLE dbo.member_notification_outbox (
  id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_member_notification_outbox PRIMARY KEY,
  event_key VARCHAR(200) NOT NULL,
  recipient_id INT NOT NULL,
  notification_id BIGINT NOT NULL,
  state VARCHAR(12) NOT NULL CONSTRAINT DF_member_outbox_state DEFAULT ('PENDING'),
  attempts INT NOT NULL CONSTRAINT DF_member_outbox_attempts DEFAULT (0),
  next_attempt_at DATETIME2 NOT NULL,
  lease_until DATETIME2 NULL,
  lease_token VARCHAR(36) NULL,
  created_at DATETIME2 NOT NULL,
  published_at DATETIME2 NULL,
  CONSTRAINT UQ_member_outbox_event_recipient UNIQUE(event_key,recipient_id),
  CONSTRAINT UQ_member_outbox_notification UNIQUE(notification_id),
  CONSTRAINT FK_member_outbox_recipient FOREIGN KEY(recipient_id) REFERENCES dbo.users(user_id),
  CONSTRAINT FK_member_outbox_notification FOREIGN KEY(notification_id) REFERENCES dbo.general_notifications(id),
  CONSTRAINT CK_member_outbox_state CHECK(state IN ('PENDING','SENDING','SENT','FAILED')),
  CONSTRAINT CK_member_outbox_attempts CHECK(attempts BETWEEN 0 AND 4)
 );
 CREATE INDEX IX_member_outbox_due ON dbo.member_notification_outbox(state,next_attempt_at,lease_until);
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
