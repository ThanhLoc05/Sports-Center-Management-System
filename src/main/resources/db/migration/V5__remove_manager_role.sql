/*
  Chuyen tai khoan tu vai tro MANAGER cu sang CENTER_MANAGER.
  Chi chay thu cong tren database da co bang roles va users.
  Khong chay file nay tren database moi da tao bang schema.sql.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @ManagerRoleId INT;
DECLARE @CenterManagerRoleId INT;

SELECT @ManagerRoleId = role_id
FROM dbo.roles
WHERE role_name = N'MANAGER';

SELECT @CenterManagerRoleId = role_id
FROM dbo.roles
WHERE role_name = N'CENTER_MANAGER';

IF @ManagerRoleId IS NOT NULL
BEGIN
    IF @CenterManagerRoleId IS NULL
    BEGIN
        /* Chua co CENTER_MANAGER: doi ten vai tro de giu nguyen cac khoa ngoai. */
        UPDATE dbo.roles
        SET role_name = N'CENTER_MANAGER'
        WHERE role_id = @ManagerRoleId;
    END
    ELSE
    BEGIN
        /* Da co CENTER_MANAGER: chuyen cac tai khoan sang vai tro nay roi xoa vai tro cu. */
        UPDATE dbo.users
        SET role_id = @CenterManagerRoleId
        WHERE role_id = @ManagerRoleId;

        DELETE FROM dbo.roles
        WHERE role_id = @ManagerRoleId;
    END;
END;

COMMIT TRANSACTION;
