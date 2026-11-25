/* Flow 4: giữ nguyên bản ghi cũ và bổ sung chỉ số có đơn vị cho các bộ môn. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.workout_log_details', N'metric_value') IS NULL
    ALTER TABLE dbo.workout_log_details ADD metric_value DECIMAL(12,3) NULL;

IF COL_LENGTH(N'dbo.workout_log_details', N'metric_unit') IS NULL
    ALTER TABLE dbo.workout_log_details ADD metric_unit VARCHAR(20) NULL;

IF OBJECT_ID(N'dbo.CK_workout_log_details_metric', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.workout_log_details WITH CHECK
        ADD CONSTRAINT CK_workout_log_details_metric CHECK (
            (metric_value IS NULL AND metric_unit IS NULL)
            OR (metric_value IS NOT NULL AND metric_unit IS NOT NULL AND metric_value >= 0
                AND metric_unit IN (''seconds'', ''minutes'', ''meters'', ''kilometers'', ''repetitions'', ''rounds'', ''hitsPer20'')
                AND (metric_unit NOT IN (''repetitions'', ''rounds'', ''hitsPer20'') OR metric_value = FLOOR(metric_value))
                AND (metric_unit <> ''hitsPer20'' OR metric_value <= 20)
                AND sets IS NULL AND reps IS NULL AND weight_kg IS NULL)
        );');

COMMIT TRANSACTION;
