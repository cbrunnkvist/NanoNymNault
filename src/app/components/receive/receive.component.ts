import { Component, OnDestroy, OnInit } from "@angular/core";
import { ChildActivationEnd, Router } from "@angular/router";
import { WalletService, WalletAccount } from "../../services/wallet.service";
import { NotificationService } from "../../services/notification.service";
import { AddressBookService } from "../../services/address-book.service";
import { ModalService } from "../../services/modal.service";
import { ApiService } from "../../services/api.service";
import { UtilService } from "../../services/util.service";
import { WorkPoolService } from "../../services/work-pool.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { NanoBlockService } from "../../services/nano-block.service";
import { PriceService } from "../../services/price.service";
import { WebsocketService } from "../../services/websocket.service";
import * as QRCode from "qrcode";
import BigNumber from "bignumber.js";
import { TranslocoService } from "@ngneat/transloco";
import { NanoNymManagerService } from "../../services/nanonym-manager.service";
import { NanoNymStorageService } from "../../services/nanonym-storage.service";
import { NanoNym } from "../../types/nanonym.types";
import { Subscription } from "rxjs";
import { TestIds } from '../../testing/test-ids';

@Component({
  selector: "app-receive",
  templateUrl: "./receive.component.html",
  styleUrls: ["./receive.component.css"],
})
export class ReceiveComponent implements OnInit, OnDestroy {
  readonly testIds = TestIds;
  nano = 1000000000000000000000000;
  accounts = this.walletService.wallet.accounts;

  timeoutIdClearingRecentlyCopiedState: any = null;
  mobileTransactionMenuModal: any = null;
  merchantModeModal: any = null;
  mobileTransactionData: any = null;

  selectedAccountAddressBookName = "";
  pendingAccountModel = "0";
  pendingBlocks = [];
  pendingBlocksForSelectedAccount = [];
  qrCodeUri = null;
  qrCodeImage = null;
  qrAccount = "";
  qrAmount: BigNumber = null;
  recentlyCopiedAccountAddress = false;
  recentlyCopiedPaymentUri = false;
  walletAccount: WalletAccount = null;
  selAccountInit = false;
  loadingIncomingTxList = false;
  amountNano = "";
  amountFiat = "";
  validNano = true;
  validFiat = true;
  qrSuccessClass = "";

  inMerchantMode = false;
  inMerchantModeQR = false;
  inMerchantModePaymentComplete = false;
  merchantModeRawRequestedQR: BigNumber = null;
  merchantModeRawRequestedTotal: BigNumber = null;
  merchantModeRawReceivedTotal: BigNumber = null;
  merchantModeRawReceivedTotalHiddenRaw: BigNumber = null;
  merchantModeSeenBlockHashes = {};
  merchantModePrompts = [];
  merchantModeTransactionHashes = [];

  routerSub = null;
  notificationSub: Subscription | null = null;

  // Tab state
  activeReceiveTab: "standard" | "nanonym" = "standard";

  // NanoNym state
  nanonyms: NanoNym[] = [];
  showGenerateNanoNymModal = false;
  newNanoNymLabel = "";
  generatingNanoNym = false;
  recentlyGeneratedNanoNym: NanoNym | null = null;
  generatedNanoNymQR: string | null = null;
  generatedFallbackQR: string | null = null;
  generateNanoNymModal: any = null;
  selectedNanoNym: NanoNym | null = null;
  detailsNanoNymQR: string | null = null;
  nanoNymDetailsModal: any = null;

  constructor(
    private route: Router,
    private walletService: WalletService,
    private notificationService: NotificationService,
    private addressBook: AddressBookService,
    public modal: ModalService,
    private api: ApiService,
    private workPool: WorkPoolService,
    public settings: AppSettingsService,
    private nanoBlock: NanoBlockService,
    public price: PriceService,
    private websocket: WebsocketService,
    private util: UtilService,
    private translocoService: TranslocoService,
    private nanoNymManager: NanoNymManagerService,
    private nanoNymStorage: NanoNymStorageService,
  ) {}

  async ngOnInit() {
    // Set active tab based on current route
    const currentUrl = this.route.url;
    if (currentUrl.includes("/receive/nanonyms")) {
      this.activeReceiveTab = "nanonym";
    } else {
      this.activeReceiveTab = "standard";
    }

    const UIkit = window["UIkit"];

    const mobileTransactionMenuModal = UIkit.modal(
      "#mobile-transaction-menu-modal",
    );
    this.mobileTransactionMenuModal = mobileTransactionMenuModal;

    const merchantModeModal = UIkit.modal("#merchant-mode-modal");
    this.merchantModeModal = merchantModeModal;

    const generateNanoNymModal = UIkit.modal("#generate-nanonym-modal");
    this.generateNanoNymModal = generateNanoNymModal;

    const nanoNymDetailsModal = UIkit.modal("#nanonym-details-modal");
    this.nanoNymDetailsModal = nanoNymDetailsModal;

    this.routerSub = this.route.events.subscribe((event) => {
      if (event instanceof ChildActivationEnd) {
        this.mobileTransactionMenuModal.hide();
        this.merchantModeModal.hide();
        this.generateNanoNymModal.hide();
        this.nanoNymDetailsModal.hide();
      }
    });

    // Load NanoNyms and start monitoring
    await this.loadNanoNyms();

    // Subscribe to notification processing events
    this.notificationSub = this.nanoNymManager.notificationProcessed$.subscribe(
      async (event) => {
        console.log("Payment received notification:", event);

        // Show success notification
        this.notificationService.sendSuccess(
          `Payment received: ${event.amount} XNO to ${event.nanoNymLabel}`,
          { length: 5000 },
        );

        // Refresh NanoNym list to update balances
        await this.loadNanoNyms();

        // Refresh balances for the specific NanoNym
        await this.nanoNymManager.refreshBalances(event.nanoNymIndex);
        await this.loadNanoNyms();
      },
    );

    // Update selected account if changed in the sidebar
    this.walletService.wallet.selectedAccount$.subscribe(async (acc) => {
      if (this.selAccountInit) {
        this.pendingAccountModel = acc ? acc.id : "0";
        this.onSelectedAccountChange(this.pendingAccountModel);
      }
      this.selAccountInit = true;
    });

    this.walletService.wallet.pendingBlocksUpdate$.subscribe(
      async (receivableBlockUpdate) => {
        if (receivableBlockUpdate === null) {
          return;
        }

        this.updatePendingBlocks();
      },
    );

    await this.updatePendingBlocks();

    if (this.walletService.wallet.selectedAccount !== null) {
      // Set the account selected in the sidebar as default
      this.pendingAccountModel = this.walletService.wallet.selectedAccount.id;
      this.onSelectedAccountChange(this.pendingAccountModel);
    } else if (this.accounts.length === 1) {
      // Auto-select account if it is the only account in the wallet
      this.pendingAccountModel = this.accounts[0].id;
      this.onSelectedAccountChange(this.pendingAccountModel);
    }

    // Listen as new transactions come in. Ignore the latest transaction that is already present on page load.
    const latest = this.websocket.newTransactions$.getValue();
    this.websocket.newTransactions$.subscribe(async (transaction) => {
      if (transaction && latest !== transaction) {
        const rawAmount = new BigNumber(transaction.amount);
        if (
          transaction.block.link_as_account === this.qrAccount &&
          rawAmount.gte(this.qrAmount || 0)
        ) {
          this.showQrConfirmation();
          setTimeout(() => this.resetAmount(), 500);
        }
        if (
          this.inMerchantModeQR === true &&
          transaction.block.link_as_account === this.qrAccount
        ) {
          this.onMerchantModeReceiveTransaction(transaction);
        }
      }
    });
  }

  ngOnDestroy() {
    this.mobileTransactionMenuModal.hide();
    this.merchantModeModal.hide();
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
    if (this.notificationSub) {
      this.notificationSub.unsubscribe();
    }
  }

  async updatePendingBlocks() {
    this.pendingBlocks = this.walletService.wallet.pendingBlocks
      .map((pendingBlock) =>
        Object.assign({}, pendingBlock, {
          account: pendingBlock.source,
          destination: pendingBlock.account,
          source: null,
          addressBookName:
            this.addressBook.getAccountName(pendingBlock.source) ||
            this.getAccountLabel(pendingBlock.source, null),
          destinationAddressBookName:
            this.addressBook.getAccountName(pendingBlock.account) ||
            this.getAccountLabel(pendingBlock.account, "Account"),
          isReceivable: true,
          local_time_string: "",
        }),
      )
      .sort((a, b) =>
        a.destinationAddressBookName.localeCompare(
          b.destinationAddressBookName,
        ),
      );

    this.filterPendingBlocksForDestinationAccount(this.pendingAccountModel);
  }

  filterPendingBlocksForDestinationAccount(selectedAccountID) {
    if (selectedAccountID === "0") {
      // Blocks for all accounts
      this.pendingBlocksForSelectedAccount = [...this.pendingBlocks];
      return;
    }

    // Blocks for selected account
    this.pendingBlocksForSelectedAccount = this.pendingBlocks.filter(
      (block) => block.destination === selectedAccountID,
    );

    if (this.inMerchantModeQR === true) {
      this.pendingBlocksForSelectedAccount.forEach((pendingBlock) => {
        this.onMerchantModeReceiveTransaction(pendingBlock);
      });
    }
  }

  showMobileMenuForTransaction(transaction) {
    this.notificationService.removeNotification("success-copied");

    this.mobileTransactionData = transaction;
    this.mobileTransactionMenuModal.show();
  }

  getAccountLabel(accountID, defaultLabel) {
    const walletAccount = this.walletService.wallet.accounts.find(
      (a) => a.id === accountID,
    );

    if (walletAccount == null) {
      return defaultLabel;
    }

    return (
      this.translocoService.translate("general.account") +
      " #" +
      walletAccount.index
    );
  }

  async getPending() {
    // clear the list of pending blocks. Updated again with reloadBalances()
    this.pendingBlocks = [];
    this.pendingBlocksForSelectedAccount = [];
    this.loadingIncomingTxList = true;
    await this.walletService.reloadBalances();
    this.loadingIncomingTxList = false;
  }

  async nanoAmountChange() {
    if (!this.validateNanoAmount() || Number(this.amountNano) === 0) {
      this.amountFiat = "";
      this.changeQRAmount();
      return;
    }
    const rawAmount = this.util.nano.mnanoToRaw(this.amountNano || 0);

    // This is getting hacky, but if their currency is bitcoin, use 6 decimals, if it is not, use 2
    const precision =
      this.settings.settings.displayCurrency === "BTC" ? 1000000 : 100;

    // Determine fiat value of the amount
    const fiatAmount = this.util.nano
      .rawToMnano(rawAmount)
      .times(this.price.price.lastPrice)
      .times(precision)
      .floor()
      .div(precision)
      .toNumber();

    this.amountFiat = fiatAmount.toString();
    this.changeQRAmount(rawAmount.toFixed());
    this.validateFiatAmount();
  }

  async fiatAmountChange() {
    if (!this.validateFiatAmount() || Number(this.amountFiat) === 0) {
      this.amountNano = "";
      this.changeQRAmount();
      return;
    }
    const rawAmount = this.util.nano.mnanoToRaw(
      new BigNumber(this.amountFiat).div(this.price.price.lastPrice),
    );
    const nanoVal = this.util.nano.rawToNano(rawAmount).floor();
    const rawRounded = this.util.nano.nanoToRaw(nanoVal);
    const nanoAmount = this.util.nano.rawToMnano(rawRounded);

    this.amountNano = nanoAmount.toFixed();
    this.changeQRAmount(rawRounded.toFixed());
    this.validateNanoAmount();
  }

  validateNanoAmount() {
    if (!this.amountNano) {
      this.validNano = true;
      return true;
    }
    this.validNano =
      this.amountNano !== "-" &&
      (this.util.account.isValidNanoAmount(this.amountNano) ||
        Number(this.amountNano) === 0);
    return this.validNano;
  }

  validateFiatAmount() {
    if (!this.amountFiat) {
      this.validFiat = true;
      return true;
    }
    this.validFiat =
      this.util.string.isNumeric(this.amountFiat) &&
      Number(this.amountFiat) >= 0;
    return this.validFiat;
  }

  onSelectedAccountChange(accountID) {
    this.selectedAccountAddressBookName =
      this.addressBook.getAccountName(accountID) ||
      this.getAccountLabel(accountID, "Account");

    this.changeQRAccount(accountID);
    this.filterPendingBlocksForDestinationAccount(accountID);
  }

  async changeQRAccount(account) {
    this.walletAccount =
      this.walletService.wallet.accounts.find((a) => a.id === account) || null;
    this.qrAccount = "";
    let qrCode = null;
    if (account.length > 1) {
      this.qrAccount = account;
      this.qrCodeImage = null;
      this.qrCodeUri = `nano:${account}${this.qrAmount ? `?amount=${this.qrAmount.toString(10)}` : ""}`;
      qrCode = await QRCode.toDataURL(this.qrCodeUri, { scale: 7 });
    }
    this.qrCodeImage = qrCode;
  }

  async changeQRAmount(raw?) {
    this.qrAmount = null;
    let qrCode = null;
    if (raw) {
      if (this.util.account.isValidAmount(raw)) {
        this.qrAmount = raw;
      }
    }
    if (this.qrAccount.length > 1) {
      this.qrCodeImage = null;
      this.qrCodeUri = `nano:${this.qrAccount}${this.qrAmount ? `?amount=${this.qrAmount.toString(10)}` : ""}`;
      qrCode = await QRCode.toDataURL(this.qrCodeUri, { scale: 7 });
      this.qrCodeImage = qrCode;
    }
  }

  showQrConfirmation() {
    this.qrSuccessClass = "in";
    setTimeout(() => {
      this.qrSuccessClass = "out";
    }, 7000);
    setTimeout(() => {
      this.qrSuccessClass = "";
    }, 12000);
  }

  resetAmount() {
    this.amountNano = "";
    this.amountFiat = "";
    this.changeQRAmount();
  }

  onReceiveFundsPress(receivableTransaction) {
    if (receivableTransaction.loading || receivableTransaction.received) {
      return;
    }

    this.receiveReceivableBlock(receivableTransaction);
  }

  async receiveReceivableBlock(receivableBlock) {
    const sourceBlock = receivableBlock.hash;

    const walletAccount = this.walletService.wallet.accounts.find(
      (a) => a.id === receivableBlock.destination,
    );
    if (!walletAccount) {
      throw new Error(`Unable to find receiving account in wallet`);
    }

    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();

      if (wasUnlocked === false) {
        return;
      }
    }
    receivableBlock.loading = true;

    let createdReceiveBlockHash = null;
    let hasShownErrorNotification = false;

    try {
      createdReceiveBlockHash = await this.nanoBlock.generateReceive(
        walletAccount,
        sourceBlock,
        this.walletService.isLedgerWallet(),
      );
    } catch (err) {
      this.notificationService.sendError(
        "Error receiving transaction: " + err.message,
      );
      hasShownErrorNotification = true;
    }

    if (createdReceiveBlockHash != null) {
      receivableBlock.received = true;
      this.mobileTransactionMenuModal.hide();
      this.notificationService.removeNotification("success-receive");
      this.notificationService.sendSuccess(`Successfully received nano!`, {
        identifier: "success-receive",
      });
      // pending has been processed, can be removed from the list
      // list also updated with reloadBalances but not if called too fast
      this.walletService.removePendingBlock(receivableBlock.hash);
    } else {
      if (hasShownErrorNotification === false) {
        if (!this.walletService.isLedgerWallet()) {
          this.notificationService.sendError(
            `Error receiving transaction, please try again`,
            { length: 10000 },
          );
        }
      }
    }

    receivableBlock.loading = false;
    this.updatePendingBlocks(); // update the list
  }

  copied() {
    this.notificationService.removeNotification("success-copied");
    this.notificationService.sendSuccess(`Successfully copied to clipboard!`, {
      identifier: "success-copied",
    });
  }

  copiedAccountAddress() {
    if (this.timeoutIdClearingRecentlyCopiedState != null) {
      clearTimeout(this.timeoutIdClearingRecentlyCopiedState);
    }
    this.recentlyCopiedAccountAddress = true;
    this.recentlyCopiedPaymentUri = false;
    this.timeoutIdClearingRecentlyCopiedState = setTimeout(() => {
      this.recentlyCopiedAccountAddress = false;
    }, 2000);
  }

  copiedPaymentUri() {
    if (this.timeoutIdClearingRecentlyCopiedState != null) {
      clearTimeout(this.timeoutIdClearingRecentlyCopiedState);
    }
    this.recentlyCopiedPaymentUri = true;
    this.recentlyCopiedAccountAddress = false;
    this.timeoutIdClearingRecentlyCopiedState = setTimeout(() => {
      this.recentlyCopiedPaymentUri = false;
    }, 2000);
  }

  toBigNumber(value) {
    return new BigNumber(value);
  }

  unsetSelectedAccount() {
    this.pendingAccountModel = "0";
    this.onSelectedAccountChange(this.pendingAccountModel);
  }

  getRawAmountWithoutTinyRaws(rawAmountWithTinyRaws) {
    const tinyRaws = rawAmountWithTinyRaws.mod(this.nano);

    return rawAmountWithTinyRaws.minus(tinyRaws);
  }

  merchantModeResetState() {
    this.unsetSelectedAccount();
    this.resetAmount();

    this.inMerchantModeQR = false;
    this.inMerchantModePaymentComplete = false;
  }

  merchantModeEnable() {
    this.merchantModeResetState();

    this.inMerchantMode = true;
    this.merchantModeModal.show();
  }

  merchantModeDisable() {
    this.inMerchantMode = false;
    this.inMerchantModeQR = false;
    this.inMerchantModePaymentComplete = false;
    this.merchantModeModal.hide();
  }

  merchantModeShowQR() {
    const isRequestingAnyAmount =
      this.validNano === false || Number(this.amountNano) === 0;

    if (isRequestingAnyAmount === true) {
      this.resetAmount();
    }

    this.merchantModeRawRequestedTotal =
      isRequestingAnyAmount === true
        ? new BigNumber(0)
        : this.util.nano.mnanoToRaw(this.amountNano);

    this.merchantModeRawRequestedQR =
      isRequestingAnyAmount === true
        ? new BigNumber(0)
        : this.util.nano.mnanoToRaw(this.amountNano);

    this.merchantModeSeenBlockHashes =
      this.pendingBlocksForSelectedAccount.reduce(
        (seenHashes, receivableBlock) => {
          seenHashes[receivableBlock.hash] = true;
          return seenHashes;
        },
        {},
      );

    this.merchantModeTransactionHashes = [];

    this.inMerchantModeQR = true;
  }

  merchantModeHideQR() {
    this.inMerchantModeQR = false;
  }

  onMerchantModeReceiveTransaction(transaction) {
    if (this.merchantModeSeenBlockHashes[transaction.hash] != null) {
      return;
    }

    this.merchantModeSeenBlockHashes[transaction.hash] = true;

    const receivedAmountWithTinyRaws = new BigNumber(transaction.amount);

    const receivedAmount = this.getRawAmountWithoutTinyRaws(
      receivedAmountWithTinyRaws,
    );

    const requestedAmount = this.getRawAmountWithoutTinyRaws(
      this.merchantModeRawRequestedQR,
    );

    if (receivedAmount.eq(requestedAmount)) {
      this.merchantModeTransactionHashes.push(transaction.hash);

      this.merchantModeMarkCompleteWithAmount(
        this.merchantModeRawRequestedTotal,
      );
    } else {
      const transactionPrompt = {
        moreThanRequested: receivedAmount.gt(requestedAmount),
        lessThanRequested: receivedAmount.lt(requestedAmount),
        amountRaw: receivedAmountWithTinyRaws,
        amountHiddenRaw: receivedAmountWithTinyRaws.mod(this.nano),
        transactionHash: transaction.hash,
      };

      this.merchantModePrompts.push(transactionPrompt);
    }
  }

  merchantModeSubtractAmountFromPrompt(prompt, promptIdx) {
    const subtractedRawWithTinyRaws = prompt.amountRaw;

    const subtractedRaw = this.getRawAmountWithoutTinyRaws(
      subtractedRawWithTinyRaws,
    );

    const newAmountRaw = this.merchantModeRawRequestedQR.minus(subtractedRaw);

    this.merchantModeRawRequestedQR = newAmountRaw;
    this.changeQRAmount(newAmountRaw.toFixed());

    this.merchantModeTransactionHashes.push(prompt.transactionHash);

    this.merchantModePrompts.splice(promptIdx, 1);
  }

  merchantModeMarkCompleteFromPrompt(prompt) {
    this.merchantModeTransactionHashes.push(prompt.transactionHash);

    this.merchantModeMarkCompleteWithAmount(prompt.amountRaw);
  }

  merchantModeDiscardPrompt(promptIdx) {
    this.merchantModePrompts.splice(promptIdx, 1);
  }

  merchantModeMarkCompleteWithAmount(amountRaw) {
    this.merchantModeRawReceivedTotal = amountRaw;
    this.merchantModeRawReceivedTotalHiddenRaw = amountRaw.mod(this.nano);

    this.inMerchantModePaymentComplete = true;
    this.inMerchantModeQR = false;
  }

  // Tab methods
  setActiveReceiveTab(tab: "standard" | "nanonym") {
    this.activeReceiveTab = tab;
    // Update route to match the selected tab
    if (tab === "nanonym") {
      this.route.navigate(["/receive/nanonyms"]);
    } else {
      this.route.navigate(["/receive"]);
    }
  }

  // NanoNym methods
  openGenerateNanoNymModal() {
    this.newNanoNymLabel = "";
    this.recentlyGeneratedNanoNym = null;
    this.generatedNanoNymQR = null;
    this.generatedFallbackQR = null;
    this.generateNanoNymModal.show();
  }

  closeGenerateNanoNymModal() {
    this.newNanoNymLabel = "";
    this.recentlyGeneratedNanoNym = null;
    this.generatedNanoNymQR = null;
    this.generatedFallbackQR = null;
    this.generateNanoNymModal.hide();
  }

  async generateNanoNym() {
    if (this.generatingNanoNym) return;

    this.generatingNanoNym = true;

    try {
      const label = this.newNanoNymLabel.trim() || undefined;
      const nanoNym = await this.nanoNymManager.createNanoNym(label);

      this.recentlyGeneratedNanoNym = nanoNym;

      // Generate QR codes
      this.generatedNanoNymQR = await QRCode.toDataURL(nanoNym.nnymAddress, {
        scale: 7,
      });
      this.generatedFallbackQR = await QRCode.toDataURL(
        nanoNym.fallbackAddress,
        { scale: 7 },
      );

      this.notificationService.sendSuccess(`NanoNym created: ${nanoNym.label}`);

      // Refresh NanoNym list
      await this.loadNanoNyms();
    } catch (error) {
      this.notificationService.sendError(
        `Failed to create NanoNym: ${error.message}`,
      );
      this.closeGenerateNanoNymModal();
    } finally {
      this.generatingNanoNym = false;
    }
  }

  async loadNanoNyms() {
    await this.nanoNymStorage.whenLoaded();
    this.nanonyms = this.nanoNymStorage.getAllNanoNyms();
  }

  get totalNanoNymBalance(): BigNumber {
    return this.nanonyms.reduce(
      (sum, nn) => sum.plus(nn.balance),
      new BigNumber(0),
    );
  }

  get activeNanoNymCount(): number {
    return this.nanonyms.filter((nn) => nn.status === "active").length;
  }

  get totalPaymentCount(): number {
    return this.nanonyms.reduce((sum, nn) => sum + nn.paymentCount, 0);
  }

  async toggleNanoNymStatus(index: number) {
    const nanoNym = this.nanonyms.find((nn) => nn.index === index);
    if (!nanoNym) return;

    try {
      if (nanoNym.status === "active") {
        await this.nanoNymManager.archiveNanoNym(index);
        this.notificationService.sendInfo(`NanoNym archived: ${nanoNym.label}`);
      } else {
        await this.nanoNymManager.reactivateNanoNym(index);
        this.notificationService.sendSuccess(
          `NanoNym reactivated: ${nanoNym.label}`,
        );
      }
      await this.loadNanoNyms();
    } catch (error) {
      this.notificationService.sendError(
        `Failed to update NanoNym: ${error.message}`,
      );
    }
  }

  showNanoNymQR(nanoNym: NanoNym) {
    // TODO: Implement QR code display modal
    // For now, just show a notification
    this.notificationService.sendInfo(`QR code for: ${nanoNym.label}`);
  }

  async viewNanoNymDetails(nanoNym: NanoNym) {
    this.selectedNanoNym = nanoNym;

    // Generate QR code for the NanoNym address
    try {
      this.detailsNanoNymQR = await QRCode.toDataURL(nanoNym.nnymAddress, {
        scale: 7,
      });
    } catch (error) {
      console.error("Failed to generate QR code:", error);
      this.detailsNanoNymQR = null;
    }

    this.nanoNymDetailsModal.show();
  }

  closeDetailsModal() {
    this.selectedNanoNym = null;
    this.detailsNanoNymQR = null;
    this.nanoNymDetailsModal.hide();
  }

  copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.notificationService.sendSuccess(`${type} copied to clipboard!`);
    });
  }
}
