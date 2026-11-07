package com.sportscenter.management.service;
import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.GeneralNotification;
import com.sportscenter.management.repository.GeneralNotificationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class GeneralNotificationHistoryTest {
 final GeneralNotificationRepository repo=mock(GeneralNotificationRepository.class);
 final SecurityUtils security=mock(SecurityUtils.class);
 final GeneralNotificationHistory service=new GeneralNotificationHistory(repo,security);
 GeneralNotification row(){return GeneralNotification.builder().id(3L).recipientId(15).senderId(14).title("Tiếng Việt").content("Nội dung").createdAt(LocalDateTime.now()).build();}
 @Test void historyUsesOnlyAuthenticatedRecipientAndBoundedPage(){
  when(security.getCurrentUserId()).thenReturn(15);
  when(repo.findByRecipientIdOrderByCreatedAtDescIdDesc(15,PageRequest.of(2,20))).thenReturn(new SliceImpl<>(List.of(row()),PageRequest.of(2,20),true));
  var result=service.list(2,20);assertEquals(15,result.content().getFirst().recipientId());assertEquals("GENERAL",result.content().getFirst().kind());assertTrue(result.hasNext());
  verify(repo).findByRecipientIdOrderByCreatedAtDescIdDesc(15,PageRequest.of(2,20));
 }
 @Test void noAuthenticationCannotReadOrMark(){
  assertEquals(401,assertThrows(ResponseStatusException.class,()->service.list(0,20)).getStatusCode().value());
  assertEquals(401,assertThrows(ResponseStatusException.class,()->service.read(3)).getStatusCode().value());verifyNoInteractions(repo);
 }
 @Test void invalidPagesNeverQuery(){
  for(int[] p:new int[][]{{-1,20},{0,0},{0,101},{100001,20}})assertThrows(IllegalArgumentException.class,()->service.list(p[0],p[1]));verifyNoInteractions(repo);
 }
 @Test void cannotMarkAnotherRecipientsNotification(){
  when(security.getCurrentUserId()).thenReturn(16);when(repo.findByIdAndRecipientId(3L,16)).thenReturn(Optional.empty());
  assertEquals(404,assertThrows(ResponseStatusException.class,()->service.read(3)).getStatusCode().value());verify(repo,never()).markRead(anyLong(),anyInt(),any());
 }
 @Test void markReadIsAtomicAndDoesNotResetReadTime(){
  var row=row();when(security.getCurrentUserId()).thenReturn(15);when(repo.findByIdAndRecipientId(3L,15)).thenReturn(Optional.of(row));
  when(repo.markRead(eq(3L),eq(15),any())).thenAnswer(call->{if(row.getReadAt()!=null)return 0;row.setReadAt(call.getArgument(2));return 1;});
  var first=service.read(3);var second=service.read(3);assertNotNull(first.readAt());assertEquals(first.readAt(),second.readAt());
 }
}
