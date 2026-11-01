/* Bổ sung bảng phiếu hỗ trợ cho database đã có bảng users. */
IF OBJECT_ID(N'dbo.support_tickets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.support_tickets (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_support_tickets PRIMARY KEY,
        member_id INT NOT NULL,
        subject NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_support_tickets_status DEFAULT N'OPEN',
        response NVARCHAR(MAX) NULL,
        resolved_by INT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_support_tickets_created_at DEFAULT SYSDATETIME(),
        resolved_at DATETIME2 NULL,
        CONSTRAINT FK_support_tickets_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_support_tickets_resolved_by FOREIGN KEY (resolved_by) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_support_tickets_status CHECK (status IN (N'OPEN', N'RESOLVED', N'CANCELLED'))
    );
END;
