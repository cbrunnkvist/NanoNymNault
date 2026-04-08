import {Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, Renderer2} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {WalletService} from './services/wallet.service';
import {AddressBookService} from './services/address-book.service';
import {AppSettingsService} from './services/app-settings.service';
import {WebsocketService} from './services/websocket.service';
import {PriceService} from './services/price.service';
import {UtilService} from './services/util.service';
import {NotificationService} from './services/notification.service';
import {WorkPoolService} from './services/work-pool.service';
import {Router} from '@angular/router';
import {SwUpdate, VersionReadyEvent, VersionInstallationFailedEvent} from '@angular/service-worker';
import {filter} from 'rxjs/operators';
import {RepresentativeService} from './services/representative.service';
import {NodeService} from './services/node.service';
import { DesktopService, LedgerService } from './services';
import { environment } from 'environments/environment';
import { DeeplinkService } from './services/deeplink.service';
import { TranslocoService } from '@ngneat/transloco';
import { version } from 'environments/version';
import { NanoNymManagerService } from './services/nanonym-manager.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less']
})
export class AppComponent implements OnInit {

  constructor(
    public walletService: WalletService,
    private addressBook: AddressBookService,
    public settings: AppSettingsService,
    private websocket: WebsocketService,
    private notifications: NotificationService,
    public nodeService: NodeService,
    private representative: RepresentativeService,
    private router: Router,
    public updates: SwUpdate,
    private workPool: WorkPoolService,
    public price: PriceService,
    private util: UtilService,
    private desktop: DesktopService,
    private ledger: LedgerService,
    private renderer: Renderer2,
    private deeplinkService: DeeplinkService,
    private translate: TranslocoService,
    private nanoNymManager: NanoNymManagerService, private destroyRef: DestroyRef) {
      router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.closeNav();
      });
    }

  @ViewChild('selectButton') selectButton: ElementRef;
  @ViewChild('accountsDropdown') accountsDropdown: ElementRef;

  wallet = this.walletService.wallet;
  node = this.nodeService.node;
  nanoPrice = this.price.price;
  totalBalance$ = this.walletService.totalBalance$;
  totalBalanceFiat$ = this.walletService.totalBalanceFiat$;
  fiatTimeout = 5 * 60 * 1000; // Update fiat prices every 5 minutes
  inactiveSeconds = 0;
  innerWidth = 0;
  innerHeight = 0;
  innerHeightWithoutMobileBar = 0;
  navExpanded = false;
  navAnimating = false;
  showAccountsDropdown = false;
  canToggleLightMode = true;
  searchData = '';
  isConfigured = this.walletService.isConfigured;
  donationAccount = environment.donationAddress;
  public appVersion = version;

  @HostListener('window:resize', ['$event']) onResize (e) {
    this.onWindowResize(e.target);
  }

  @HostListener('document:mousedown', ['$event']) onGlobalClick(event): void {
    if (
            ( this.selectButton.nativeElement.contains(event.target) === false )
          && ( this.accountsDropdown.nativeElement.contains(event.target) === false )
      ) {
        this.showAccountsDropdown = false;
    }
  }

  async ngOnInit() {
    this.onWindowResize(window);
    this.settings.loadAppSettings();

    // Check for testnet URL parameter
    this.checkTestnetParameter();

    this.updateAppTheme();

    // New for v19: Patch saved xrb_ prefixes to nano_
    await this.patchXrbToNanoPrefixData();

    // set translation language
    this.translate.setActiveLang(this.settings.settings.language);

    this.addressBook.loadAddressBook();
    this.workPool.loadWorkCache();

    await this.walletService.loadStoredWallet();
    // Subscribe to any transaction tracking
    for (const entry of this.addressBook.addressBook) {
      if (entry.trackTransactions) {
        this.walletService.trackAddress(entry.account);
      }
    }

    // Navigate to accounts page if there is wallet, but only if coming from home. On desktop app the path ends with index.html
    if (this.walletService.isConfigured() && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
      if (this.wallet.selectedAccountId) {
        this.router.navigate([`account/${this.wallet.selectedAccountId}`], { queryParams: {'compact': 1}, replaceUrl: true });
      } else {
        this.router.navigate(['accounts'], { replaceUrl: true });
      }
    }

    // update selected account object with the latest balance, pending, etc
    if (this.wallet.selectedAccountId) {
      const currentUpdatedAccount = this.wallet.accounts.find(a => a.id === this.wallet.selectedAccountId) ?? null;
      this.wallet.selectedAccount = currentUpdatedAccount;
    }

    await this.walletService.reloadBalances();

    // Start monitoring all NanoNyms on app start
    await this.nanoNymManager.startMonitoringAll();

    // Workaround fix for github pages when Nault is refreshed (or externally linked) and there is a subpath for example to the send screen.
    // This data is saved from the 404.html page
    const path = localStorage.getItem('path');

    if (path) {
      const search = localStorage.getItem('query'); // ?param=value
      const fragment = localStorage.getItem('fragment'); // #value
      localStorage.removeItem('path');
      localStorage.removeItem('query');
      localStorage.removeItem('fragment');

      if (search && search.length) {
        const queryParams = {};
        const urlSearch = new URLSearchParams(search);
        urlSearch.forEach(function(value, key) {
          queryParams[key] = value;
        });
        this.router.navigate([path], { queryParams: queryParams, replaceUrl: true });
      } else if (fragment && fragment.length) {
        this.router.navigate([path], { fragment: fragment, replaceUrl: true });
      } else {
        this.router.navigate([path], { replaceUrl: true });
      }
    }

    this.websocket.connect();

    this.representative.loadRepresentativeList();

    // If the wallet is locked and there is a pending balance, show a warning to unlock the wallet
    // (if not receive priority is set to manual)
    if (this.wallet.locked && this.walletService.hasPendingTransactions() && this.settings.settings.pendingOption !== 'manual') {
      this.notifications.sendWarning(`New incoming transaction(s) - Unlock the wallet to receive`, { length: 10000, identifier: 'pending-locked' });
    } else if (this.walletService.hasPendingTransactions() && this.settings.settings.pendingOption === 'manual') {
      this.notifications.sendWarning(`Incoming transaction(s) found - Set to be received manually`, { length: 10000, identifier: 'pending-locked' });
    }

    // When the page closes, determine if we should lock the wallet
    window.addEventListener('beforeunload',  (e) => {
      if (this.wallet.locked) return; // Already locked, nothing to worry about
      this.walletService.lockWallet();
    });
    window.addEventListener('unload',  (e) => {
      if (this.wallet.locked) return; // Already locked, nothing to worry about
      this.walletService.lockWallet();
    });

    // handle deeplinks
    this.desktop.on('deeplink', (e, deeplink) => {
      if (!this.deeplinkService.navigate(deeplink)) this.notifications.sendWarning('This URI has an invalid address.', { length: 5000 });
    });
    this.desktop.send('deeplink-ready');

    // Notify user if service worker update is available (Angular 17+ API)
    this.updates.versionUpdates.pipe(
      filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((event) => {
      console.log(`SW update available. Current: ${event.currentVersion.hash}. New: ${event.latestVersion.hash}`);
      this.notifications.sendInfo(
        'An update was installed in the background and will be applied on next launch. <a href="#" (click)="applySwUpdate()">Apply immediately</a>',
        { length: 10000 }
      );
    });

    // Notify user if service worker update failed
    this.updates.versionUpdates.pipe(
      filter((evt): evt is VersionInstallationFailedEvent => evt.type === 'VERSION_INSTALLATION_FAILED'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((event) => {
      console.error(`SW update failed: ${event.error}`);
    });

    // Check how long the wallet has been inactive, and lock it if it's been too long
    setInterval(() => {
      this.inactiveSeconds += 1;
      if (!this.settings.settings.lockInactivityMinutes) return; // Do not lock on inactivity
      if (this.wallet.locked || !this.wallet.password) return;

      // Determine if we have been inactive for longer than our lock setting
      if (this.inactiveSeconds >= this.settings.settings.lockInactivityMinutes * 60) {
        this.walletService.lockWallet();
        this.notifications.sendSuccess(`Wallet locked after ${this.settings.settings.lockInactivityMinutes} minutes of inactivity`);
      }
    }, 1000);

    try {
      if (!this.settings.settings.serverAPI) return;
      await this.updateFiatPrices();
    } catch (err) {
      this.notifications.sendWarning(`There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.`, { length: 0, identifier: `price-adblock` });
    }
  }

  onWindowResize(windowObject) {
    this.innerWidth = windowObject.innerWidth;
    this.innerHeight = windowObject.innerHeight;

    const isMobileBarVisible = (this.innerWidth < 940);

    if (isMobileBarVisible === true) {
      this.innerHeightWithoutMobileBar = this.innerHeight - 50;
    } else {
      this.innerHeightWithoutMobileBar = this.innerHeight;
    }
  }

  /*
    This is important as it looks through saved data using hardcoded xrb_ prefixes
    (Your wallet, address book, rep list, etc) and updates them to nano_ prefix for v19 RPC
   */
  async patchXrbToNanoPrefixData() {
    // If wallet is version 2, data has already been patched.  Otherwise, patch all data
    if (this.settings.settings.walletVersion >= 2) return;

    await this.walletService.patchOldSavedData(); // Change saved xrb_ addresses to nano_
    this.addressBook.patchXrbPrefixData();
    this.representative.patchXrbPrefixData();

    this.settings.setAppSetting('walletVersion', 2); // Update wallet version so we do not patch in the future.
  }

  applySwUpdate() {
    this.updates.activateUpdate();
  }

  toggleNav() {
    this.navExpanded = !this.navExpanded;
    this.onNavExpandedChange();
  }

  closeNav() {
    if (this.navExpanded === false) {
      return;
    }

    this.navExpanded = false;
    this.onNavExpandedChange();
  }

  onNavExpandedChange() {
    this.navAnimating = true;
    setTimeout(() => { this.navAnimating = false; }, 350);
  }

  toggleLightMode() {
    if (this.canToggleLightMode === false) {
      return;
    }

    this.canToggleLightMode = false;
    setTimeout(() => { this.canToggleLightMode = true; }, 300);

    this.settings.setAppSetting('lightModeEnabled', !this.settings.settings.lightModeEnabled);
    this.updateAppTheme();
  }

  updateAppTheme() {
    if (this.settings.settings.lightModeEnabled) {
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    } else {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    }
  }

  toggleAccountsDropdown() {
    if (this.showAccountsDropdown === true) {
      this.showAccountsDropdown = false;
      return;
    }

    this.showAccountsDropdown = true;
    this.accountsDropdown.nativeElement.scrollTop = 0;
  }

  selectAccount(account) {
    // note: account is null when user is switching to 'Total Balance'
    this.wallet.selectedAccountId = account ? account.id : null;
    this.wallet.selectedAccount = account;
    this.wallet.selectedAccount$.next(account);
    this.toggleAccountsDropdown();
    this.walletService.saveWalletExport();
  }

  performSearch() {
    const searchData = this.searchData.trim();
    if (!searchData.length) return;

    const isValidNanoAccount = (
        ( searchData.startsWith('xrb_') || searchData.startsWith('nano_') )
      && this.util.account.isValidAccount(searchData)
    );

    if (isValidNanoAccount === true) {
      this.router.navigate(['account', searchData]);
      this.searchData = '';
      return;
    }

    const isValidBlockHash = this.util.nano.isValidHash(searchData);

    if (isValidBlockHash === true) {
      const blockHash = searchData.toUpperCase();
      this.router.navigate(['transaction', blockHash]);
      this.searchData = '';
      return;
    }

    this.notifications.sendWarning(`Invalid nano address or block hash! Please double check your input`);
  }

  updateIdleTime() {
    this.inactiveSeconds = 0; // Action has happened, reset the inactivity timer
  }

  retryConnection() {
    if (!this.settings.settings.serverAPI) {
      this.notifications.sendInfo(`Wallet server settings is set to offline mode. Please change server first!`);
      return;
    }
    this.walletService.reloadBalances();
    this.notifications.sendInfo(`Attempting to reconnect to nano node`);
  }

  async updateFiatPrices() {
    const displayCurrency = this.settings.getAppSetting(`displayCurrency`) || 'USD';
    await this.price.getPrice(displayCurrency);
    this.walletService.reloadFiatBalances();
    setTimeout(() => this.updateFiatPrices(), this.fiatTimeout);
  }

  /**
   * Check for testnet URL parameter and switch to testnet mode if present.
   * Hidden feature: ?testnet=true or ?testnet=1
   */
  checkTestnetParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const testnetParam = urlParams.get('testnet');

    if (testnetParam === 'true' || testnetParam === '1') {
      const currentServer = this.settings.settings.serverName;

      // Only switch if not already on testnet
      if (currentServer !== 'testnet') {
        console.log('Testnet mode activated via URL parameter');
        this.settings.setAppSetting('serverName', 'testnet');
        this.settings.loadServerSettings();
        this.notifications.sendInfo('Testnet mode enabled - Connected to local testnet node (port 17076)');
      }
    }
  }
}
