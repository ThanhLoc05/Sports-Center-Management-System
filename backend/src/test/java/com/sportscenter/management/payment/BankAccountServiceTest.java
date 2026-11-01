package com.sportscenter.management.payment;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Kiểm thử cấu hình dùng chung và version tránh ghi đè thay đổi của quản lý khác. */
// TẠO MỚI: BankAccountServiceTest — Kiểm thử quyền cập nhật/version và snapshot ngân hàng; không ghi cấu hình ngân hàng thật.
class BankAccountServiceTest {
    private final CenterBankAccountRepository repository=mock(CenterBankAccountRepository.class);
    private final BankAccountService service=new BankAccountService(repository);
    private final BankAccountData bank=new BankAccountData("970436","Vietcombank","0000000000","TRUNG TAM TEST",null);
    @Test void emptyDatabaseHasNoInventedReceivingAccount() {
        assertNull(service.get().bankAccount());
        assertThrows(ResponseStatusException.class,service::requireAccount);
    }
    @Test void firstSaveReturnsANewPublicVersionAndPreservesLeadingZeroes() {
        when(repository.saveAndFlush(any())).thenAnswer(call->{CenterBankAccount v=call.getArgument(0);v.setVersion(0);return v;});
        var saved=service.save(new BankAccountService.Change(bank,0));
        assertEquals(1,saved.version()); assertEquals("0000000000",saved.bankAccount().accountNo());
        assertEquals("Vietcombank",saved.bankAccount().gatewayName());
    }
    @Test void aClientWithTheEmptyDatabaseVersionCannotOverwriteAnExistingAccount() {
        CenterBankAccount account=new CenterBankAccount();account.setVersion(0);
        when(repository.findById(1)).thenReturn(Optional.of(account));
        assertThrows(ResponseStatusException.class,()->service.save(new BankAccountService.Change(bank,0)));
        verify(repository,never()).saveAndFlush(any());
    }
    @Test void clearingSettingsKeepsTheRowAndIncreasesTheVersion() {
        CenterBankAccount account=new CenterBankAccount();account.setVersion(0);account.setEnabled(true);
        when(repository.findById(1)).thenReturn(Optional.of(account));
        when(repository.saveAndFlush(any())).thenAnswer(call->{account.setVersion(1);return account;});
        assertEquals(2,service.clear(1).version());assertFalse(account.isEnabled());
        verify(repository,never()).delete(any());
    }
}
