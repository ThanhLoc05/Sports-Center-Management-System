package com.sportscenter.management.training;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.sportscenter.management.training.TrainingModels.*;

class TrainingPolicyTest {
    SlotInput slot(int day) {return new SlotInput(day,LocalTime.of(17,50),LocalTime.of(18,50),1,1);}
    @Test void twelveSessionsThreeDaysWeeklyHaveComputedEndDate() {
        var dates=TrainingPolicy.courseOccurrences(List.of(slot(1),slot(3),slot(5)),LocalDate.of(2026,11,30),12);
        assertEquals(12,dates.size()); assertEquals(LocalDate.of(2026,12,25),dates.getLast().start().toLocalDate());
        assertEquals(3,dates.stream().filter(d->d.start().isBefore(LocalDate.of(2026,12,7).atStartOfDay())).count());
    }
    @Test void twoDaysWeeklyAndMembershipLastDayAreInclusive() {
        var dates=TrainingPolicy.occurrences(List.of(slot(2),slot(4)),LocalDate.of(2026,12,1),LocalDate.of(2026,12,10));
        assertEquals(4,dates.size());assertEquals(LocalDate.of(2026,12,10),dates.getLast().start().toLocalDate());
    }
    @Test void allWeeklyDaysMustFitAvailabilityIncludingWholeTimeInterval() {
        var slots=List.of(new Slot(1,1,LocalTime.of(17,50),LocalTime.of(18,50),1,"Coach",1,"Room"),new Slot(2,3,LocalTime.of(17,50),LocalTime.of(18,50),1,"Coach",1,"Room"));
        var monday=new Availability(1,null,LocalTime.of(17,0),LocalTime.of(19,0));
        assertFalse(TrainingPolicy.matches(slots,List.of(monday)));
        assertTrue(TrainingPolicy.matches(slots,List.of(monday,new Availability(3,null,LocalTime.of(17,50),LocalTime.of(18,50)))));
        assertFalse(TrainingPolicy.matches(slots,List.of(monday,new Availability(3,null,LocalTime.of(18,0),LocalTime.of(19,0)))));
    }
    @Test void rejectsDuplicateDaysMidnightAndWrongOpeningWeekday() {
        assertThrows(IllegalArgumentException.class,()->TrainingPolicy.validateSlots(List.of(slot(1),slot(1))));
        assertThrows(IllegalArgumentException.class,()->TrainingPolicy.validateSlots(List.of(new SlotInput(1,LocalTime.of(23,0),LocalTime.of(1,0),1,1))));
        assertThrows(IllegalArgumentException.class,()->TrainingPolicy.courseOccurrences(List.of(slot(1)),LocalDate.of(2026,12,1),12));
    }
    @Test void adjacentSessionsDoNotConflictAndVipIncludesStandard() {
        var start=LocalDateTime.of(2026,12,1,17,0);
        assertFalse(TrainingPolicy.overlaps(start,start.plusHours(1),start.plusHours(1),start.plusHours(2)));
        assertTrue(TrainingPolicy.overlaps(start,start.plusHours(1),start.plusMinutes(59),start.plusHours(2)));
        assertTrue(TrainingPolicy.levelAllowed("VIP","STANDARD")); assertFalse(TrainingPolicy.levelAllowed("STANDARD","VIP"));
    }
}
