/*
    Tao database SportCenterDB - SQL Server 2019.

    Script nay chi tao database rong va se DUNG neu database da ton tai.
    Khong xoa database, khong ghi de du lieu.

    Sau khi chay:
    1. Chon SportCenterDB trong SSMS va chay schema.sql.
    2. Chay sample-running-data.sql de them tai khoan va du lieu demo.
*/
USE [master];
GO

IF DB_ID(N'SportCenterDB') IS NOT NULL
    THROW 51010, N'SportCenterDB da ton tai; script khong xoa hoac ghi de database.', 1;
GO

CREATE DATABASE [SportCenterDB];
GO
