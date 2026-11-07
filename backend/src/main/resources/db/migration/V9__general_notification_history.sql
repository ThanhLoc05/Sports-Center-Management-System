-- GENERAL history only. No seed/backfill. Review and backup before manual execution.
SET XACT_ABORT ON;
IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb') THROW 51030,'Select an approved project database',1;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.general_notifications') IS NOT NULL
   THROW 51031,'GENERAL history object already exists; verify schema before reapplying',1;
 CREATE TABLE dbo.general_notifications (
  id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_general_notifications PRIMARY KEY,
  sender_id INT NOT NULL,
  recipient_id INT NOT NULL,
  title NVARCHAR(150) NOT NULL,
  content NVARCHAR(4000) NOT NULL,
  link NVARCHAR(500) NULL,
  created_at DATETIME2 NOT NULL,
  read_at DATETIME2 NULL,
  CONSTRAINT FK_general_notifications_sender FOREIGN KEY(sender_id) REFERENCES dbo.users(user_id),
  CONSTRAINT FK_general_notifications_recipient FOREIGN KEY(recipient_id) REFERENCES dbo.users(user_id)
 );
 CREATE INDEX IX_general_notifications_recipient_created ON dbo.general_notifications(recipient_id,created_at DESC,id DESC);
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
