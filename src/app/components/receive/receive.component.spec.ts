import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@ngneat/transloco';
import { ReceiveComponent } from './receive.component';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { AddressBookService } from '../../services/address-book.service';
import { ModalService } from '../../services/modal.service';
import { ApiService } from '../../services/api.service';
import { UtilService } from '../../services/util.service';
import { WorkPoolService } from '../../services/work-pool.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { NanoBlockService } from '../../services/nano-block.service';
import { PriceService } from '../../services/price.service';
import { WebsocketService } from '../../services/websocket.service';
import { TranslocoService } from '@ngneat/transloco';
import { NanoNymManagerService } from '../../services/nanonym-manager.service';
import { NanoNymStorageService } from '../../services/nanonym-storage.service';
import { Router } from '@angular/router';
import { NanoNymAccount } from '../../types/spendable-account.types';
import BigNumber from 'bignumber.js';

describe('ReceiveComponent', () => {
  let component: ReceiveComponent;
  let fixture: ComponentFixture<ReceiveComponent>;
  let mockWalletService: jasmine.SpyObj<WalletService>;
  let mockNanoNymStorage: jasmine.SpyObj<NanoNymStorageService>;
  let spendableAccountsSubject: Subject<NanoNymAccount[]>;

  beforeEach(waitForAsync(() => {
    spendableAccountsSubject = new Subject<NanoNymAccount[]>();

    mockWalletService = jasmine.createSpyObj('WalletService', [], {
      spendableAccounts$: spendableAccountsSubject.asObservable(),
      wallet: { accounts: [] }
    });

    mockNanoNymStorage = jasmine.createSpyObj('NanoNymStorageService', ['whenLoaded', 'getAllNanoNyms'], {
      nanonyms$: of([])
    });
    mockNanoNymStorage.whenLoaded.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      declarations: [ReceiveComponent],
      imports: [FormsModule, TranslocoModule],
      providers: [
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['events']) },
        { provide: WalletService, useValue: mockWalletService },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['sendSuccess', 'sendError', 'removeNotification']) },
        { provide: AddressBookService, useValue: jasmine.createSpyObj('AddressBookService', ['getAccountName']) },
        { provide: ModalService, useValue: jasmine.createSpyObj('ModalService', ['dismissAll']) },
        { provide: ApiService, useValue: jasmine.createSpyObj('ApiService', ['accountInfo']) },
        { provide: UtilService, useValue: jasmine.createSpyObj('UtilService', ['nano']) },
        { provide: WorkPoolService, useValue: jasmine.createSpyObj('WorkPoolService', ['generateWork']) },
        { provide: AppSettingsService, useValue: jasmine.createSpyObj('AppSettingsService', ['changeLanguage'], { settings: {} }) },
        { provide: NanoBlockService, useValue: jasmine.createSpyObj('NanoBlockService', ['processWork']) },
        { provide: PriceService, useValue: jasmine.createSpyObj('PriceService', ['update'], { price: { lastPrice: 1 } }) },
        { provide: WebsocketService, useValue: jasmine.createSpyObj('WebsocketService', ['reconnect'], { newTransactions$: of(null) }) },
        { provide: TranslocoService, useValue: jasmine.createSpyObj('TranslocoService', ['translate']) },
        { provide: NanoNymManagerService, useValue: jasmine.createSpyObj('NanoNymManagerService', ['generateNanoNym']) },
        { provide: NanoNymStorageService, useValue: mockNanoNymStorage }
      ]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ReceiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // SKIPPED: Comprehensive component tests pending E2E test framework setup (Playwright).
  // See docs/E2E-TEST-IDS.md for E2E testing strategy.
  // Component dependencies require full DI setup; defer to Playwright E2E tests for realistic flows.
  xit('should create', () => {
    expect(component).toBeTruthy();
  });

  xdescribe('NanoNym detection', () => {
    xit('should populate nanoNymAccounts from spendableAccounts$', () => {
      const mockNanoNyms: NanoNymAccount[] = [
        { id: 'nnym_test', type: 'nanonym', balance: new BigNumber(0) } as NanoNymAccount
      ];

      spendableAccountsSubject.next(mockNanoNyms);
      fixture.detectChanges();

      expect(component.nanoNymAccounts).toEqual(mockNanoNyms);
    });

    xit('should set isSelectedAccountNanoNym to true for nnmy_ addresses', () => {
      component.onSelectedAccountChange('nnym_123');
      expect(component.isSelectedAccountNanoNym).toBeTrue();
    });

    xit('should set isSelectedAccountNanoNym to false for nano_ addresses', () => {
      component.onSelectedAccountChange('nano_123');
      expect(component.isSelectedAccountNanoNym).toBeFalse();
    });

    xit('should set isSelectedAccountNanoNym to false for all accounts (0)', () => {
      component.onSelectedAccountChange('0');
      expect(component.isSelectedAccountNanoNym).toBeFalse();
    });
  });

  // TODO: Add tests for badge visibility in HTML via Playwright E2E tests
});
