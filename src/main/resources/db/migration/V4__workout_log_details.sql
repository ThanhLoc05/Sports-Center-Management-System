IF OBJECT_ID(N'dbo.workout_log_details', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_log_details (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_log_details PRIMARY KEY,
        log_id INT NOT NULL,
        exercise_name NVARCHAR(255) NOT NULL,
        sets INT NULL,
        reps INT NULL,
        weight_kg DECIMAL(8,2) NULL,
        CONSTRAINT FK_workout_log_details_logs FOREIGN KEY (log_id) REFERENCES dbo.workout_logs(id),
        CONSTRAINT CK_workout_log_details_sets CHECK (sets IS NULL OR sets > 0),
        CONSTRAINT CK_workout_log_details_reps CHECK (reps IS NULL OR reps > 0),
        CONSTRAINT CK_workout_log_details_weight CHECK (weight_kg IS NULL OR weight_kg >= 0)
    );
END;
