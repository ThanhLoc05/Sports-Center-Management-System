package com.sportscenter.management.service;
import com.sportscenter.management.config.NotificationJpaWebConfig;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockServletContext;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class NotificationOsivScopeTest {
 @Configuration @EnableWebMvc @Import(NotificationJpaWebConfig.class)
 static class Config {
  @Bean EntityManagerFactory factory(){
   var factory=mock(EntityManagerFactory.class);var em=mock(jakarta.persistence.EntityManager.class);
   when(em.isOpen()).thenReturn(true);when(factory.createEntityManager()).thenReturn(em);when(factory.createEntityManager(anyMap())).thenReturn(em);
   return factory;
  }
  @Bean Probe controller(){return new Probe();}
 }
 @RestController static class Probe {
  @GetMapping("/api/v1/notifications/stream") SseEmitter stream() throws Exception {var e=new SseEmitter(0L);e.send(SseEmitter.event().comment("connected"));return e;}
  @PostMapping("/test/login") String login(){return "ok";}
 }
 @Test void thirtyTwoOpenStreamsNeverAcquireAnOsivEntityManager() throws Exception {
  try(var context=new AnnotationConfigWebApplicationContext()){
   context.setServletContext(new MockServletContext());context.register(Config.class);context.refresh();
   var mvc=MockMvcBuilders.webAppContextSetup(context).build();var factory=context.getBean(EntityManagerFactory.class);clearInvocations(factory);
   for(int i=0;i<32;i++)mvc.perform(get("/api/v1/notifications/stream")).andExpect(status().isOk()).andExpect(request().asyncStarted());
   verify(factory,never()).createEntityManager();verify(factory,never()).createEntityManager(anyMap());
   // OSIV is still enabled for ordinary MVC requests; the exclusion is stream-only.
   mvc.perform(post("/test/login")).andExpect(status().isOk());
   verify(factory,atLeastOnce()).createEntityManager();
  }
 }
}
