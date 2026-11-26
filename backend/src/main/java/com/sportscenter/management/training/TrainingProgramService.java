package com.sportscenter.management.training;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.service.MemberNotificationOutboxService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.util.*;
import static com.sportscenter.management.training.TrainingModels.*;

@Service @RequiredArgsConstructor @Transactional
public class TrainingProgramService {
    private final JdbcTemplate jdbc;
    private final TrainingAccessService access;
    private final SecurityUtils security;
    private final MemberNotificationOutboxService notifications;

    public record Data(int id,String kind,String name,int sportId,String sportName,String description,
            String trainingLevel,int capacity,String requiredLevel,String status,int createdBy,
            Integer totalSessions,LocalDate startDate,LocalDate endDate,BigDecimal price,boolean discountEligible) {}

    public void lock() { access.lock(); }
    private String table(String kind) {
        if("REGULAR".equals(kind)) return "regular_classes";
        if("COURSE".equals(kind)) return "courses";
        throw new IllegalArgumentException("Loại lớp không hợp lệ");
    }
    private String parentColumn(String kind) { return "COURSE".equals(kind)?"course_id":"regular_class_id"; }

    public Data data(String kind,int id) {
        var rows=jdbc.query("SELECT p.*,s.sport_name "+("COURSE".equals(kind)?"":",CAST(NULL AS int) AS total_sessions,CAST(NULL AS date) AS start_date,CAST(NULL AS date) AS end_date,CAST(NULL AS decimal(18,2)) AS price,CAST(0 AS bit) AS discount_eligible")
                +" FROM "+table(kind)+" p JOIN sports s ON s.sport_id=p.sport_id WHERE p.id=?",(rs,n)->new Data(rs.getInt("id"),kind,rs.getString("name"),rs.getInt("sport_id"),rs.getString("sport_name"),
                rs.getString("description"),rs.getString("training_level"),rs.getInt("max_capacity"),rs.getString("required_access_level"),rs.getString("status"),rs.getInt("created_by"),
                (Integer)rs.getObject("total_sessions"),rs.getDate("start_date")==null?null:rs.getDate("start_date").toLocalDate(),rs.getDate("end_date")==null?null:rs.getDate("end_date").toLocalDate(),rs.getBigDecimal("price"),rs.getBoolean("discount_eligible")),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Không tìm thấy lớp/khóa học");
        return rows.getFirst();
    }

    public List<Slot> slots(String kind,int id) {
        return jdbc.query("SELECT t.*,u.full_name,r.room_name FROM training_slots t JOIN users u ON u.user_id=t.coach_id JOIN rooms r ON r.room_id=t.room_id WHERE t."+parentColumn(kind)+"=? ORDER BY t.day_of_week,t.start_time",(rs,n)->new Slot(rs.getInt("id"),rs.getInt("day_of_week"),rs.getTime("start_time").toLocalTime(),rs.getTime("end_time").toLocalTime(),rs.getInt("coach_id"),rs.getString("full_name"),rs.getInt("room_id"),rs.getString("room_name")),id);
    }

    public List<SlotInput> slotInputs(String kind,int id) {
        return slots(kind,id).stream().map(s->new SlotInput(s.dayOfWeek(),s.startTime(),s.endTime(),s.coachId(),s.roomId())).toList();
    }

    @Transactional(readOnly=true)
    public List<Program> search(String kind,SearchInput request) {
        Integer member=access.selectedMember(request==null?null:request.memberId());
        Integer sport=request==null?null:request.sportId(),coach=request==null?null:request.coachId();
        var ids=jdbc.queryForList("SELECT id FROM "+table(kind)+" ORDER BY id DESC",Integer.class);
        var result=new ArrayList<Program>();
        for(int id:ids) {
            Data row=data(kind,id);
            var weekly=slots(kind,id);
            if(sport!=null && sport!=row.sportId()) continue;
            if(coach!=null && weekly.stream().noneMatch(s->s.coachId()==coach)) continue;
            if(security.isCoach() && !security.isCenterManager() && weekly.stream().noneMatch(s->s.coachId()==security.getCurrentUserId())) continue;
            if(request!=null && !TrainingPolicy.matches(weekly,request.availability())) continue;
            Program view=view(row,weekly,member);
            if(member!=null && !view.eligible() && !view.registered()) continue;
            if(member!=null && !("ACTIVE".equals(row.status()) || "OPEN".equals(row.status()) || view.registered())) continue;
            if(request!=null && request.availability()!=null && member!=null) {
                var current=access.findAccess(member);
                if(current.isPresent() && request.availability().stream().anyMatch(w->w.date()!=null && (w.date().isBefore(access.today()) || w.date().isAfter(current.get().endDate())))) continue;
            }
            result.add(view);
        }
        return result;
    }

    @Transactional(readOnly=true)
    public Program detail(String kind,int id,Integer requestedMember) {
        Integer member=access.selectedMember(requestedMember);
        Data row=data(kind,id);
        var weekly=slots(kind,id);
        if(security.isCoach() && !security.isCenterManager() && weekly.stream().noneMatch(s->s.coachId()==security.getCurrentUserId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"HLV chỉ xem lớp/khóa mình phụ trách");
        return view(row,weekly,member);
    }

    private Program view(Data row,List<Slot> weekly,Integer member) {
        var membership=member==null?Optional.<TrainingAccessService.Access>empty():access.findAccess(member);
        int discount="COURSE".equals(row.kind()) && row.discountEligible() && membership.isPresent()?membership.get().discountPercent():0;
        BigDecimal payable=row.price()==null?null:row.price().multiply(BigDecimal.valueOf(100-discount)).divide(BigDecimal.valueOf(100),0,RoundingMode.HALF_UP);
        boolean registered=member!=null && ("REGULAR".equals(row.kind())?access.registered(row.id(),member,access.today()):hasConfirmedCourse(row.id(),member));
        LocalDate until=null;
        if(registered && "REGULAR".equals(row.kind())) {
            until=jdbc.queryForObject("SELECT MAX(CASE WHEN reg.valid_until<s.end_date THEN reg.valid_until ELSE s.end_date END) FROM regular_class_registrations reg JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id WHERE reg.regular_class_id=? AND reg.member_id=? AND reg.status='ACTIVE' AND s.status='ACTIVE'",LocalDate.class,row.id(),member);
        }
        String reason=member==null?"":eligibility(row,member);
        int remaining="REGULAR".equals(row.kind())?regularRemaining(row,membership.orElse(null),null):courseRemaining(row.id());
        return new Program(row.id(),row.kind(),row.name(),row.sportId(),row.sportName(),row.description(),row.trainingLevel(),row.capacity(),row.requiredLevel(),row.status(),weekly,
                row.totalSessions(),row.startDate(),row.endDate(),row.price(),row.discountEligible(),discount,payable,remaining,reason.isEmpty(),reason,registered,until);
    }

    public String eligibility(Data row,int member) {
        try {
            var membership=access.requireAccess(member);
            if("REGULAR".equals(row.kind())) requireRegular(row,membership);
            else requireCourse(row,membership,true);
            return "";
        } catch(ResponseStatusException error) { return error.getReason(); }
          catch(IllegalArgumentException error) { return error.getMessage(); }
    }

    public void requireRegular(Data row,TrainingAccessService.Access membership) {
        if(!"ACTIVE".equals(row.status())) throw conflict("Lớp đang ngừng nhận đăng ký");
        access.requireProgramLevel(membership,row.requiredLevel());
        if(!access.sportAllowed(membership,row.sportId())) throw conflict("Bộ môn không thuộc lựa chọn của kỳ gói này");
        boolean registered=access.registered(row.id(),membership.memberId(),access.today());
        if(!registered) {
            access.requireClassQuota(membership,row.id());
            if(regularRemaining(row,membership,membership.memberId())<=0) throw conflict("Lớp đã đủ chỗ trong thời gian gói của bạn");
        }
        var dates=regularOccurrences(row,membership.endDate());
        if(dates.isEmpty()) throw conflict("Không còn buổi học nào của lớp trong thời hạn gói");
        for(var date:dates) access.requireNoMemberConflict(membership.memberId(),date.start(),date.end(),row.id(),null,null);
    }

    private List<Occurrence> regularOccurrences(Data row,LocalDate until) {
        var planned=new LinkedHashMap<LocalDateTime,Occurrence>();
        for(var occurrence:TrainingPolicy.occurrences(slotInputs("REGULAR",row.id()),access.today(),until)) planned.put(occurrence.start(),occurrence);
        jdbc.query("SELECT * FROM classes WHERE regular_class_id=? AND (schedule_time>=? OR planned_time>=?)",rs->{
            LocalDateTime original=rs.getTimestamp("planned_time")==null?rs.getTimestamp("schedule_time").toLocalDateTime():rs.getTimestamp("planned_time").toLocalDateTime();
            planned.remove(original);
            LocalDateTime actual=rs.getTimestamp("schedule_time").toLocalDateTime();
            if("SCHEDULED".equals(rs.getString("status")) && actual.isAfter(access.now()) && !actual.toLocalDate().isAfter(until)) {
                var slot=new SlotInput(actual.getDayOfWeek().getValue(),actual.toLocalTime(),actual.plusMinutes(rs.getInt("duration_minutes")).toLocalTime(),rs.getInt("coach_id"),rs.getInt("room_id"));
                planned.put(original,new Occurrence(actual,actual.plusMinutes(rs.getInt("duration_minutes")),slot));
            }
        },row.id(),access.today().atStartOfDay(),access.today().atStartOfDay());
        return planned.values().stream().filter(o->o.start().isAfter(access.now())).sorted(Comparator.comparing(Occurrence::start)).toList();
    }

    public void requireCourse(Data row,TrainingAccessService.Access membership,boolean checkSeat) {
        LocalDateTime first=jdbc.queryForObject("SELECT MIN(schedule_time) FROM classes WHERE course_id=? AND status<>'CANCELLED'",LocalDateTime.class,row.id());
        if(!"OPEN".equals(row.status()) || first==null || !first.isAfter(access.now()))
            throw conflict("Khóa học đã bắt đầu hoặc không còn mở đăng ký");
        access.requireProgramLevel(membership,row.requiredLevel());
        if(row.startDate().isBefore(membership.startDate()) || row.endDate().isAfter(membership.endDate()))
            throw conflict("Gói thành viên phải có hiệu lực đến hết khóa ngày "+row.endDate());
        if(checkSeat && !hasConfirmedCourse(row.id(),membership.memberId()) && !hasPendingCourse(row.id(),membership.memberId()) && courseRemaining(row.id())<=0)
            throw conflict("Khóa học đã đủ chỗ");
        for(var session:sessions("COURSE",row.id())) {
            if(!"SCHEDULED".equals(session.getStatus())) continue;
            access.requireNoMemberConflict(membership.memberId(),session.getScheduleTime(),session.getScheduleTime().plusMinutes(session.getDurationMinutes()),null,row.id(),null);
            int booked=jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings WHERE class_id=? AND status='BOOKED' AND member_id<>?",Integer.class,session.getId(),membership.memberId());
            if(booked>=session.getMaxCapacity()) throw conflict("Một buổi của khóa đã hết chỗ");
        }
    }

    public int courseRemaining(int id) {
        int count=jdbc.queryForObject("SELECT COUNT(*) FROM course_orders WHERE course_id=? AND (status='CONFIRMED' OR (status='PENDING_PAYMENT' AND expires_at>?))",Integer.class,id,access.now());
        return Math.max(0,data("COURSE",id).capacity()-count);
    }
    public boolean hasConfirmedCourse(int course,int member) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM course_orders WHERE course_id=? AND member_id=? AND status='CONFIRMED'",Integer.class,course,member)>0;
    }
    public boolean hasPendingCourse(int course,int member) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM course_orders WHERE course_id=? AND member_id=? AND status='PENDING_PAYMENT' AND expires_at>?",Integer.class,course,member,access.now())>0;
    }
    private int regularRemaining(Data row,TrainingAccessService.Access membership,Integer excludeMember) {
        LocalDate from=access.today(),until=membership==null?from.plusDays(90):membership.endDate();
        int count=jdbc.queryForObject("""
                SELECT COUNT(DISTINCT reg.member_id) FROM regular_class_registrations reg
                JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id
                WHERE reg.regular_class_id=? AND reg.status='ACTIVE' AND s.status='ACTIVE'
                    AND reg.valid_from<=? AND reg.valid_until>=? AND s.start_date<=? AND s.end_date>=?
                    AND (? IS NULL OR reg.member_id<>?)
                """,Integer.class,row.id(),until,from,until,from,excludeMember,excludeMember);
        return Math.max(0,row.capacity()-count);
    }

    public Program save(String kind,Integer id,ProgramInput input) {
        lock();
        validateInput(kind,input);
        Data previous=id==null?null:data(kind,id);
        if(previous!=null && ("CANCELLED".equals(previous.status()) || "COMPLETED".equals(previous.status()) || "ONGOING".equals(previous.status())))
            throw conflict("Chỉ chỉnh sửa toàn bộ lịch của lớp/khóa đang mở. Hãy tạo đợt mới hoặc đổi lịch từng buổi.");
        if(previous!=null) {
            if("COURSE".equals(kind) && jdbc.queryForObject("SELECT COUNT(*) FROM course_orders WHERE course_id=? AND status IN ('CONFIRMED','PENDING_PAYMENT')",Integer.class,id)>0)
                throw conflict("Khóa đã có đơn đăng ký. Chỉ đổi từng buổi trong lịch hoặc tạo đợt khóa mới.");
            if("REGULAR".equals(kind) && jdbc.queryForObject("SELECT COUNT(*) FROM regular_class_registrations reg JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id WHERE reg.regular_class_id=? AND reg.status='ACTIVE' AND s.status='ACTIVE' AND reg.valid_until>=? AND s.end_date>=?",Integer.class,id,access.today(),access.today())>0)
                throw conflict("Lớp đang có học viên. Hãy đổi từng buổi trong lịch; muốn đổi toàn bộ lịch, ngừng lớp cũ và mở lớp mới.");
        }
        List<Occurrence> courseDates="COURSE".equals(kind)?TrainingPolicy.courseOccurrences(input.slots(),input.startDate(),input.totalSessions()):List.of();
        validateResources(kind,id,input.slots(),courseDates);
        Integer actor=security.getCurrentUserId();
        if(id==null) {
            if("REGULAR".equals(kind)) id=jdbc.queryForObject("INSERT regular_classes(name,sport_id,description,training_level,max_capacity,required_access_level,status,created_by,created_at) OUTPUT INSERTED.id VALUES(?,?,?,?,?,?,'ACTIVE',?,?)",Integer.class,
                    input.name().trim(),input.sportId(),input.description(),input.trainingLevel(),input.maxCapacity(),input.requiredAccessLevel(),actor,access.now());
            else id=jdbc.queryForObject("INSERT courses(name,sport_id,description,training_level,max_capacity,required_access_level,total_sessions,start_date,end_date,price,discount_eligible,status,created_by,created_at) OUTPUT INSERTED.id VALUES(?,?,?,?,?,?,?,?,?,?,?,'OPEN',?,?)",Integer.class,
                    input.name().trim(),input.sportId(),input.description(),input.trainingLevel(),input.maxCapacity(),input.requiredAccessLevel(),input.totalSessions(),courseDates.getFirst().start().toLocalDate(),courseDates.getLast().start().toLocalDate(),input.price(),!Boolean.FALSE.equals(input.discountEligible()),actor,access.now());
        } else {
            cancelFutureSessions(kind,id);
            if("REGULAR".equals(kind)) jdbc.update("UPDATE regular_classes SET name=?,sport_id=?,description=?,training_level=?,max_capacity=?,required_access_level=? WHERE id=?",
                    input.name().trim(),input.sportId(),input.description(),input.trainingLevel(),input.maxCapacity(),input.requiredAccessLevel(),id);
            else jdbc.update("UPDATE courses SET name=?,sport_id=?,description=?,training_level=?,max_capacity=?,required_access_level=?,total_sessions=?,start_date=?,end_date=?,price=?,discount_eligible=? WHERE id=?",
                    input.name().trim(),input.sportId(),input.description(),input.trainingLevel(),input.maxCapacity(),input.requiredAccessLevel(),input.totalSessions(),courseDates.getFirst().start().toLocalDate(),courseDates.getLast().start().toLocalDate(),input.price(),!Boolean.FALSE.equals(input.discountEligible()),id);
            jdbc.update("DELETE FROM training_slots WHERE "+parentColumn(kind)+"=?",id);
        }
        for(var slot:input.slots()) jdbc.update("INSERT training_slots(regular_class_id,course_id,day_of_week,start_time,end_time,coach_id,room_id) VALUES(?,?,?,?,?,?,?)",
                "REGULAR".equals(kind)?id:null,"COURSE".equals(kind)?id:null,slot.dayOfWeek(),slot.startTime(),slot.endTime(),slot.coachId(),slot.roomId());
        Data row=data(kind,id);
        if("REGULAR".equals(kind)) generateRegular(row,access.today().plusDays(56));
        else for(int i=0;i<courseDates.size();i++) createSession(row,courseDates.get(i),i+1);
        return view(row,slots(kind,id),null);
    }

    private void validateInput(String kind,ProgramInput input) {
        if(input==null || input.name()==null || input.name().isBlank() || input.name().length()>150 || input.sportId()==null || input.maxCapacity()==null || input.maxCapacity()<1
                || input.trainingLevel()==null || input.trainingLevel().isBlank() || !("STANDARD".equals(input.requiredAccessLevel()) || "VIP".equals(input.requiredAccessLevel())))
            throw new IllegalArgumentException("Tên, bộ môn, trình độ, sức chứa và cấp gói là bắt buộc");
        TrainingPolicy.validateSlots(input.slots());
        if(jdbc.queryForObject("SELECT COUNT(*) FROM sports WHERE sport_id=?",Integer.class,input.sportId())!=1)
            throw new IllegalArgumentException("Bộ môn không tồn tại");
        for(var slot:input.slots()) {
            if(jdbc.queryForObject("SELECT COUNT(*) FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=? AND u.status='ACTIVE' AND r.role_name='COACH'",Integer.class,slot.coachId())!=1)
                throw new IllegalArgumentException("HLV phải đang hoạt động");
            var capacities=jdbc.queryForList("SELECT capacity FROM rooms WHERE room_id=?",Integer.class,slot.roomId());
            if(capacities.isEmpty() || capacities.getFirst()<input.maxCapacity()) throw new IllegalArgumentException("Sức chứa lớp/khóa không được vượt sức chứa phòng");
        }
        if("COURSE".equals(kind)) {
            if(input.startDate()==null || input.startDate().isBefore(access.today()) || input.price()==null || input.price().signum()<=0 || input.price().stripTrailingZeros().scale()>0)
                throw new IllegalArgumentException("Khóa học cần ngày khai giảng từ hôm nay và học phí nguyên VND lớn hơn 0");
            var dates=TrainingPolicy.courseOccurrences(input.slots(),input.startDate(),input.totalSessions());
            if(!dates.getFirst().start().isAfter(access.now())) throw new IllegalArgumentException("Buổi khai giảng phải ở tương lai");
        } else if(input.totalSessions()!=null || input.startDate()!=null || input.price()!=null)
            throw new IllegalArgumentException("Lớp thường không có kỳ học, tổng số buổi hoặc học phí riêng");
    }

    private void validateResources(String kind,Integer id,List<SlotInput> slots,List<Occurrence> dates) {
        for(var slot:slots) {
            var others=jdbc.query("SELECT t.* FROM training_slots t JOIN regular_classes r ON r.id=t.regular_class_id WHERE r.status='ACTIVE' AND t.day_of_week=? AND (t.coach_id=? OR t.room_id=?) AND (? IS NULL OR t.regular_class_id<>?)",
                    (rs,n)->new SlotInput(rs.getInt("day_of_week"),rs.getTime("start_time").toLocalTime(),rs.getTime("end_time").toLocalTime(),rs.getInt("coach_id"),rs.getInt("room_id")),slot.dayOfWeek(),slot.coachId(),slot.roomId(),"REGULAR".equals(kind)?id:null,"REGULAR".equals(kind)?id:null);
            for(var other:others) if(slot.startTime().isBefore(other.endTime()) && other.startTime().isBefore(slot.endTime()))
                throw conflict("Trùng lịch tuần của HLV hoặc phòng vào thứ "+(slot.dayOfWeek()+1));
            if("REGULAR".equals(kind)) {
                var existing=jdbc.query("SELECT schedule_time,duration_minutes FROM classes WHERE status='SCHEDULED' AND schedule_time>? AND (coach_id=? OR room_id=?) AND (? IS NULL OR regular_class_id IS NULL OR regular_class_id<>?)",
                        (rs,n)->new LocalDateTime[]{rs.getTimestamp(1).toLocalDateTime(),rs.getTimestamp(1).toLocalDateTime().plusMinutes(rs.getInt(2))},access.now(),slot.coachId(),slot.roomId(),id,id);
                for(var other:existing) if(other[0].getDayOfWeek().getValue()==slot.dayOfWeek() && slot.startTime().isBefore(other[1].toLocalTime()) && other[0].toLocalTime().isBefore(slot.endTime()))
                    throw conflict("Trùng một buổi của HLV hoặc phòng ngày "+other[0].toLocalDate());
            }
        }
        for(var occurrence:dates) requireResourceFree(occurrence.start(),occurrence.end(),occurrence.slot().coachId(),occurrence.slot().roomId(),null,"COURSE".equals(kind)?id:null,null);
    }

    public record RegularReservation(String name, int weekday, LocalTime start, LocalTime end, int coachId, int roomId) {}

    @Transactional(readOnly = true)
    public List<RegularReservation> activeRegularReservations() {
        return jdbc.query("""
                SELECT r.name, t.day_of_week, t.start_time, t.end_time, t.coach_id, t.room_id
                FROM training_slots t JOIN regular_classes r ON r.id=t.regular_class_id
                WHERE r.status='ACTIVE'
                ORDER BY r.id, t.day_of_week, t.start_time
                """, (row, index) -> new RegularReservation(row.getString(1), row.getInt(2),
                row.getTime(3).toLocalTime(), row.getTime(4).toLocalTime(), row.getInt(5), row.getInt(6)));
    }

    public void requireResourceFree(LocalDateTime start,LocalDateTime end,int coach,int room,Integer regular,Integer course,Integer session) {
        int count=jdbc.queryForObject("SELECT COUNT(*) FROM classes WHERE status='SCHEDULED' AND schedule_time<? AND DATEADD(minute,duration_minutes,schedule_time)>? AND (coach_id=? OR room_id=?) AND (? IS NULL OR class_id<>?)",Integer.class,
                end,start,coach,room,session,session);
        if(count>0) throw conflict("Trùng HLV hoặc phòng vào "+start.toLocalDate()+" lúc "+start.toLocalTime());
        count=jdbc.queryForObject("SELECT COUNT(*) FROM training_slots t JOIN regular_classes r ON r.id=t.regular_class_id WHERE r.status='ACTIVE' AND t.day_of_week=? AND t.start_time<CAST(? AS time) AND t.end_time>CAST(? AS time) AND (t.coach_id=? OR t.room_id=?) AND (? IS NULL OR r.id<>?)",Integer.class,
                start.getDayOfWeek().getValue(),end.toLocalTime(),start.toLocalTime(),coach,room,regular,regular);
        if(count>0) throw conflict("Trùng lịch lớp thường của HLV hoặc phòng vào "+start.toLocalDate());
    }

    public List<ClassResponse> sessions(String kind,int id) {
        data(kind,id);
        return jdbc.query("SELECT * FROM classes WHERE "+parentColumn(kind)+"=? ORDER BY schedule_time",(rs,n)->ClassResponse.builder().id(rs.getInt("class_id")).className(rs.getString("class_name")).sportId(rs.getInt("sport_id"))
                .coachId(rs.getInt("coach_id")).roomId(rs.getInt("room_id")).maxCapacity(rs.getInt("max_capacity"))
                .scheduleTime(rs.getTimestamp("schedule_time").toLocalDateTime()).durationMinutes(rs.getInt("duration_minutes"))
                .requiredAccessLevel(rs.getString("required_access_level")).status(rs.getString("status"))
                .regularClassId((Integer)rs.getObject("regular_class_id")).courseId((Integer)rs.getObject("course_id")).build(),id);
    }

    public void generateRegular(Data row,LocalDate until) {
        if(!"ACTIVE".equals(row.status())) return;
        for(var date:TrainingPolicy.occurrences(slotInputs("REGULAR",row.id()),access.today(),until))
            if(date.start().isAfter(access.now())) createSession(row,date,0);
    }

    private int createSession(Data row,Occurrence date,int index) {
        String parent=parentColumn(row.kind());
        var existing=jdbc.queryForList("SELECT class_id,status,program_suspended,schedule_time FROM classes WHERE "+parent+"=? AND COALESCE(planned_time,schedule_time)=?",row.id(),date.start());
        int duration=(int)Duration.between(date.start(),date.end()).toMinutes();
        if(!existing.isEmpty()) {
            var old=existing.getFirst();
            int id=((Number)old.get("class_id")).intValue();
            if(Boolean.TRUE.equals(old.get("program_suspended"))) {
                LocalDateTime actual=((java.sql.Timestamp)old.get("schedule_time")).toLocalDateTime();
                requireResourceFree(actual,actual.plusMinutes(duration),date.slot().coachId(),date.slot().roomId(),"REGULAR".equals(row.kind())?row.id():null,"COURSE".equals(row.kind())?row.id():null,id);
                jdbc.update("UPDATE classes SET status='SCHEDULED',program_suspended=0,coach_id=?,room_id=?,duration_minutes=?,max_capacity=?,class_name=?,sport_id=?,required_access_level=? WHERE class_id=?",
                        date.slot().coachId(),date.slot().roomId(),duration,row.capacity(),index>0?row.name()+" · Buổi "+index+"/"+row.totalSessions():row.name(),row.sportId(),row.requiredLevel(),id);
            }
            return id;
        }
        requireResourceFree(date.start(),date.end(),date.slot().coachId(),date.slot().roomId(),"REGULAR".equals(row.kind())?row.id():null,"COURSE".equals(row.kind())?row.id():null,null);
        return jdbc.queryForObject("INSERT classes(class_name,sport_id,coach_id,room_id,max_capacity,schedule_time,duration_minutes,required_access_level,status,regular_class_id,course_id,planned_time) OUTPUT INSERTED.class_id VALUES(?,?,?,?,?,?,?,?,'SCHEDULED',?,?,?)",Integer.class,
                index>0?row.name()+" · Buổi "+index+"/"+row.totalSessions():row.name(),row.sportId(),date.slot().coachId(),date.slot().roomId(),row.capacity(),date.start(),duration,row.requiredLevel(),
                "REGULAR".equals(row.kind())?row.id():null,"COURSE".equals(row.kind())?row.id():null,date.start());
    }

    public Registration register(int id,Integer requestedMember) {
        lock();
        int member=access.requireMember(requestedMember);
        access.lockMember(member);
        var membership=access.requireAccess(member);
        Data row=data("REGULAR",id);
        requireRegular(row,membership);
        if(access.registered(id,member,access.today())) throw conflict("Bạn đã đăng ký lớp này");
        access.chooseSport(membership,row.sportId());
        generateRegular(row,membership.endDate());
        var old=jdbc.queryForList("SELECT id FROM regular_class_registrations WHERE regular_class_id=? AND member_id=? AND subscription_id=?",Integer.class,id,member,membership.subscriptionId());
        int registration;
        if(old.isEmpty()) registration=jdbc.queryForObject("INSERT regular_class_registrations(regular_class_id,member_id,subscription_id,valid_from,valid_until,status,created_at) OUTPUT INSERTED.id VALUES(?,?,?,?,?,'ACTIVE',?)",Integer.class,
                id,member,membership.subscriptionId(),access.today(),membership.endDate(),access.now());
        else { registration=old.getFirst();jdbc.update("UPDATE regular_class_registrations SET status='ACTIVE',valid_from=?,valid_until=?,created_at=? WHERE id=?",access.today(),membership.endDate(),access.now(),registration); }
        bookProgramSessions("REGULAR",id,member,access.today(),membership.endDate());
        notifyMember("REGULAR_REGISTERED:"+registration+":"+UUID.randomUUID(),row.createdBy(),member,"Đăng ký lớp thành công",row.name()+". Quyền tham gia đến "+membership.endDate());
        return new Registration(registration,id,row.name(),member,membership.subscriptionId(),access.today(),membership.endDate(),"ACTIVE");
    }

    public void bookProgramSessions(String kind,int id,int member,LocalDate from,LocalDate until) {
        for(var session:sessions(kind,id)) {
            if(!"SCHEDULED".equals(session.getStatus()) || !session.getScheduleTime().isAfter(access.now()) || session.getScheduleTime().toLocalDate().isBefore(from) || session.getScheduleTime().toLocalDate().isAfter(until)) continue;
            access.requireNoMemberConflict(member,session.getScheduleTime(),session.getScheduleTime().plusMinutes(session.getDurationMinutes()),"REGULAR".equals(kind)?id:null,"COURSE".equals(kind)?id:null,null);
            var old=jdbc.queryForList("SELECT booking_id,status FROM class_bookings WHERE class_id=? AND member_id=?",session.getId(),member);
            if(!old.isEmpty() && "BOOKED".equals(old.getFirst().get("status"))) continue;
            int count=jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings WHERE class_id=? AND status='BOOKED'",Integer.class,session.getId());
            if(count>=session.getMaxCapacity()) throw conflict("Buổi ngày "+session.getScheduleTime().toLocalDate()+" đã hết chỗ");
            if(old.isEmpty()) jdbc.update("INSERT class_bookings(class_id,member_id,booked_at,status) VALUES(?,?,?,'BOOKED')",session.getId(),member,access.now());
            else jdbc.update("UPDATE class_bookings SET status='BOOKED',booked_at=? WHERE booking_id=?",access.now(),old.getFirst().get("booking_id"));
        }
    }

    @Transactional(readOnly=true)
    public List<Registration> registrations(Integer requested) {
        Integer member=access.selectedMember(requested);
        if(member==null && !security.isCenterManager() && !security.isReceptionist()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return jdbc.query("SELECT reg.*,c.name,s.end_date AS subscription_end,s.status AS subscription_status FROM regular_class_registrations reg JOIN regular_classes c ON c.id=reg.regular_class_id JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id WHERE (? IS NULL OR reg.member_id=?) ORDER BY reg.created_at DESC",(rs,n)->{
            LocalDate until=rs.getDate("valid_until").toLocalDate(),sourceEnd=rs.getDate("subscription_end").toLocalDate();
            if(sourceEnd.isBefore(until)) until=sourceEnd;
            String state=rs.getString("status");
            if("ACTIVE".equals(state) && (until.isBefore(access.today()) || !"ACTIVE".equals(rs.getString("subscription_status")))) state="EXPIRED";
            return new Registration(rs.getInt("id"),rs.getInt("regular_class_id"),rs.getString("name"),rs.getInt("member_id"),rs.getInt("subscription_id"),rs.getDate("valid_from").toLocalDate(),until,state);
        },member,member);
    }

    public void cancelRegistration(int id) {
        lock();
        var rows=jdbc.queryForList("SELECT * FROM regular_class_registrations WHERE id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Không tìm thấy đăng ký lớp");
        var reg=rows.getFirst();int member=((Number)reg.get("member_id")).intValue();
        if(!security.isOwnerOrAuthorized(member)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        access.lockMember(member);
        jdbc.update("UPDATE regular_class_registrations SET status='CANCELLED' WHERE id=?",id);
        cancelMemberSessions("REGULAR",((Number)reg.get("regular_class_id")).intValue(),member);
        Data row=data("REGULAR",((Number)reg.get("regular_class_id")).intValue());
        notifyMember("REGULAR_CANCELLED:"+id+":"+UUID.randomUUID(),row.createdBy(),member,"Đã hủy đăng ký lớp",row.name()+". Lịch sử các buổi đã học được giữ lại.");
    }

    public void cancelMemberSessions(String kind,int id,int member) {
        jdbc.update("UPDATE b SET status='CANCELLED' FROM class_bookings b JOIN classes c ON c.class_id=b.class_id WHERE c."+parentColumn(kind)+"=? AND b.member_id=? AND b.status='BOOKED' AND c.schedule_time>?",id,member,access.now());
    }

    private void cancelFutureSessions(String kind,int id) {
        jdbc.update("UPDATE b SET status='CANCELLED' FROM class_bookings b JOIN classes c ON c.class_id=b.class_id WHERE c."+parentColumn(kind)+"=? AND c.schedule_time>? AND b.status='BOOKED'",id,access.now());
        jdbc.update("UPDATE classes SET status='CANCELLED',program_suspended=1 WHERE "+parentColumn(kind)+"=? AND schedule_time>? AND status='SCHEDULED'",id,access.now());
    }

    public Program setStatus(String kind,int id,String state) {
        lock();
        Data row=data(kind,id);
        if("REGULAR".equals(kind)) {
            if(!Set.of("ACTIVE","PAUSED","CANCELLED").contains(state)) throw new IllegalArgumentException("Trạng thái lớp không hợp lệ");
            if("ACTIVE".equals(state)) validateResources(kind,id,slotInputs(kind,id),List.of());
            else {
                var members=jdbc.queryForList("SELECT DISTINCT member_id FROM regular_class_registrations WHERE regular_class_id=? AND status='ACTIVE'",Integer.class,id);
                cancelFutureSessions(kind,id);
                jdbc.update("UPDATE regular_class_registrations SET status='CANCELLED' WHERE regular_class_id=? AND status='ACTIVE'",id);
                for(int member:members) notifyMember("REGULAR_STOPPED:"+id+":"+member+":"+UUID.randomUUID(),row.createdBy(),member,"Lớp thường ngừng hoạt động",row.name()+" đã ngừng mở. Vui lòng chọn lịch lớp khác.");
            }
        } else {
            if(!"CANCELLED".equals(state)) throw new IllegalArgumentException("Chỉ hủy toàn khóa qua thao tác này");
            cancelFutureSessions(kind,id);
            jdbc.update("UPDATE course_orders SET status='CANCELLED',version=version+1 WHERE course_id=? AND status='PENDING_PAYMENT'",id);
            jdbc.update("UPDATE i SET payment_status='CANCELLED' FROM invoices i JOIN course_orders o ON o.id=i.course_order_id WHERE o.course_id=? AND o.status='CANCELLED' AND i.payment_status='PENDING'",id);
            for(int member:jdbc.queryForList("SELECT member_id FROM course_orders WHERE course_id=? AND status='CONFIRMED'",Integer.class,id))
                notifyMember("COURSE_CANCELLED:"+id+":"+member,row.createdBy(),member,"Khóa học đã bị hủy",row.name()+" đã hủy. Liên hệ lễ tân để xử lý học phí.");
        }
        jdbc.update("UPDATE "+table(kind)+" SET status=? WHERE id=?",state,id);
        if("REGULAR".equals(kind) && "ACTIVE".equals(state)) generateRegular(data(kind,id),access.today().plusDays(56));
        return view(data(kind,id),slots(kind,id),null);
    }

    public void validateSessionChange(Classes session,LocalDateTime start,int duration,int coach,int room) {
        requireResourceFree(start,start.plusMinutes(duration),coach,room,session.getRegularClassId(),session.getCourseId(),session.getId());
        if(session.getRegularClassId()==null && session.getCourseId()==null) return;
        Data parent=data(session.getCourseId()!=null?"COURSE":"REGULAR",session.getCourseId()!=null?session.getCourseId():session.getRegularClassId());
        if(session.getSportId()!=parent.sportId() || !session.getRequiredAccessLevel().equals(parent.requiredLevel()))
            throw conflict("Bộ môn và cấp gói của buổi học phải theo lớp/khóa gốc");
        for(int member:jdbc.queryForList("SELECT member_id FROM class_bookings WHERE class_id=? AND status='BOOKED'",Integer.class,session.getId())) {
            access.requireNoMemberConflict(member,start,start.plusMinutes(duration),null,null,session.getId());
            var membership=access.requireAccess(member);
            LocalDate last=start.toLocalDate();
            if(session.getCourseId()!=null && data("COURSE",session.getCourseId()).endDate().isAfter(last)) last=data("COURSE",session.getCourseId()).endDate();
            if(start.toLocalDate().isBefore(membership.startDate()) || last.isAfter(membership.endDate())) throw conflict("Đổi lịch làm buổi/khóa vượt hạn gói của học viên #"+member);
        }
    }

    public void refreshCourseDates(Integer course) {
        if(course!=null) jdbc.update("UPDATE courses SET start_date=(SELECT MIN(CONVERT(date,schedule_time)) FROM classes WHERE course_id=? AND status<>'CANCELLED'),end_date=(SELECT MAX(CONVERT(date,schedule_time)) FROM classes WHERE course_id=? AND status<>'CANCELLED') WHERE id=?",course,course,course);
    }

    public void maintainSchedules() {
        lock();
        var expired=jdbc.queryForList("SELECT reg.id,reg.regular_class_id,reg.member_id FROM regular_class_registrations reg JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id WHERE reg.status='ACTIVE' AND (reg.valid_until<? OR s.end_date<? OR s.status<>'ACTIVE')",access.today(),access.today());
        for(var reg:expired) {
            jdbc.update("UPDATE regular_class_registrations SET status='EXPIRED' WHERE id=?",reg.get("id"));
            cancelMemberSessions("REGULAR",((Number)reg.get("regular_class_id")).intValue(),((Number)reg.get("member_id")).intValue());
        }
        for(int id:jdbc.queryForList("SELECT id FROM regular_classes WHERE status='ACTIVE'",Integer.class)) {
            Data row=data("REGULAR",id);
            LocalDate until=access.today().plusDays(56);
            LocalDate last=jdbc.queryForObject("SELECT MAX(CASE WHEN reg.valid_until<s.end_date THEN reg.valid_until ELSE s.end_date END) FROM regular_class_registrations reg JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id WHERE reg.regular_class_id=? AND reg.status='ACTIVE' AND s.status='ACTIVE'",LocalDate.class,id);
            if(last!=null && last.isAfter(until)) until=last;
            generateRegular(row,until);
            for(var reg:registrationsForProgram(id)) bookProgramSessions("REGULAR",id,reg.memberId(),access.today(),reg.validUntil());
        }
        jdbc.update("UPDATE courses SET status='ONGOING' WHERE status='OPEN' AND EXISTS(SELECT 1 FROM classes c WHERE c.course_id=courses.id AND c.status<>'CANCELLED' AND c.schedule_time<=?)",access.now());
        jdbc.update("UPDATE courses SET status='COMPLETED' WHERE status IN ('OPEN','ONGOING') AND NOT EXISTS(SELECT 1 FROM classes c WHERE c.course_id=courses.id AND c.status='SCHEDULED')");
    }

    private List<Registration> registrationsForProgram(int id) {
        return jdbc.query("SELECT reg.*,c.name,CASE WHEN reg.valid_until<s.end_date THEN reg.valid_until ELSE s.end_date END AS effective_until FROM regular_class_registrations reg JOIN regular_classes c ON c.id=reg.regular_class_id JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id WHERE reg.regular_class_id=? AND reg.status='ACTIVE' AND s.status='ACTIVE' AND reg.valid_until>=? AND s.end_date>=?",(rs,n)->new Registration(rs.getInt("id"),id,rs.getString("name"),rs.getInt("member_id"),rs.getInt("subscription_id"),rs.getDate("valid_from").toLocalDate(),rs.getDate("effective_until").toLocalDate(),"ACTIVE"),id,access.today(),access.today());
    }

    public void notifyMember(String key,int sender,int member,String title,String content) {
        notifications.enqueue(key,sender,member,title,content,"/schedule");
    }

    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
