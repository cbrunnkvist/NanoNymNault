import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@ngneat/transloco';
import { AccountsComponent } from './accounts.component';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { ModalService } from '../../services/modal.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { RepresentativeService } from '../../services/representative.service';
import { Router } from '@angular/router';
import { LedgerService } from '../../services/ledger.service';
import { TranslocoService } from '@ngneat/transloco';
import { NanoNymStorageService } from '../../services/nanonym-storage.service';
import { NanoNymManagerService } from '../../services/nanonym-manager.service';
import { ElementRef } from '@angular/core';

describe('AccountsComponent', () => {
  let component: AccountsComponent;
  let fixture: ComponentFixture<AccountsComponent>;
  let mockWalletService: jasmine.SpyObj<WalletService>;
  let mockNanoNymManager: jasmine.SpyObj<NanoNymManagerService>;
  let mockNanoNymStorage: jasmine.SpyObj<NanoNymStorageService>;
  let spendableAccountsSubject: Subject<any[]>;

  beforeEach(waitForAsync(() => {
    spendableAccountsSubject = new Subject<any[]>();

    mockWalletService = jasmine.createSpyObj('WalletService', [], {
      spendableAccounts$: spendableAccountsSubject.asObservable(),
      wallet: { accounts: [] },
      isLedgerWallet: () => false,
      isSingleKeyWallet: () => false
    });

    mockNanoNymManager = jasmine.createSpyObj('NanoNymManagerService', ['archiveNanoNym', 'reactivateNanoNym']);
    mockNanoNymStorage = jasmine.createSpyObj('NanoNymStorageService', ['whenLoaded']);

    TestBed.configureTestingModule({
      declarations: [AccountsComponent],
      imports: [FormsModule, TranslocoModule],
      providers: [
        { provide: WalletService, useValue: mockWalletService },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['sendSuccess', 'sendError', 'sendInfo', 'removeNotification']) },
        { provide: ModalService, useValue: jasmine.createSpyObj('ModalService', ['dismissAll']) },
        { provide: AppSettingsService, useValue: jasmine.createSpyObj('AppSettingsService', ['changeLanguage']) },
        { provide: RepresentativeService, useValue: jasmine.createSpyObj('RepresentativeService', ['detectChangeableReps']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: LedgerService, useValue: jasmine.createSpyObj('LedgerService', ['disconnect']) },
        { provide: TranslocoService, useValue: jasmine.createSpyObj('TranslocoService', ['translate']) },
        { provide: NanoNymStorageService, useValue: mockNanoNymStorage },
        { provide: NanoNymManagerService, useValue: mockNanoNymManager }
      ]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AccountsComponent);
    component = fixture.componentInstance;

    component.generateNanoNymModalRef = { nativeElement: {} } as ElementRef;
    spyOn((window as any)['UIkit'], 'modal').and.returnValue({
      show: jasmine.createSpy('show'),
      hide: jasmine.createSpy('hide')
    });

    fixture.detectChanges();
  });

  xit('should create', () => {
    expect(component).toBeTruthy();
  });
});
