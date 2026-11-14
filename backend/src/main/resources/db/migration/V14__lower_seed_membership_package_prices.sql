UPDATE dbo.membership_packages
SET price = CASE package_name
    WHEN N'Gói STANDARD 1 tháng' THEN 500
    WHEN N'Gói STANDARD 3 tháng' THEN 1350
    WHEN N'Gói VIP 1 tháng' THEN 800
    WHEN N'Gói VIP 3 tháng' THEN 2100
END
WHERE package_name IN (
    N'Gói STANDARD 1 tháng',
    N'Gói STANDARD 3 tháng',
    N'Gói VIP 1 tháng',
    N'Gói VIP 3 tháng'
)
AND (
    (package_name = N'Gói STANDARD 1 tháng' AND price = 500000)
    OR (package_name = N'Gói STANDARD 3 tháng' AND price = 1350000)
    OR (package_name = N'Gói VIP 1 tháng' AND price = 800000)
    OR (package_name = N'Gói VIP 3 tháng' AND price = 2100000)
);
