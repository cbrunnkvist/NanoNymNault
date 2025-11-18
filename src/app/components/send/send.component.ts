import { Component, OnInit } from "@angular/core";
import BigNumber from "bignumber.js";
import { AddressBookService } from "../../services/address-book.service";
import { BehaviorSubject } from "rxjs";
import { WalletService } from "../../services/wallet.service";
import { NotificationService } from "../../services/notification.service";
import { ApiService } from "../../services/api.service";
import { UtilService } from "../../services/util.service";
import { WorkPoolService } from "../../services/work-pool.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { ActivatedRoute } from "@angular/router";
import { PriceService } from "../../services/price.service";
import { NanoBlockService } from "../../services/nano-block.service";
import { QrModalService } from "../../services/qr-modal.service";
import { environment } from "environments/environment";
import { TranslocoService } from "@ngneat/transloco";
import { HttpClient } from "@angular/common/http";
import * as nanocurrency from "nanocurrency";
import { NanoNymCryptoService } from "../../services/nanonym-crypto.service";
import { NostrNotificationService } from "../../services/nostr-notification.service";
import { NanoNymManagerService } from "../../services/nanonym-manager.service";
import {
  SpendableAccount,
  RegularAccount,
  NanoNymAccount,
  formatSpendableAccountLabel
} from "../../types/spendable-account.types";
import { NanoNymAccountSelectionService } from "../../services/nanonym-account-selection.service";
import { TestIds } from '../../testing/test-ids';

const nacl = window["nacl"];

@Component({
  selector: "app-send",
  templateUrl: "./send.component.html",
  styleUrls: ["./send.component.css"],
})
export class SendComponent implements OnInit {
  readonly testIds = TestIds;
  nano = 1000000000000000000000000;

  activePanel = "send";
  sendDestinationType = "external-address";

  accounts = this.walletService.wallet.accounts;
  spendableAccounts: SpendableAccount[] = [];
  selectedSpendableAccount: SpendableAccount | null = null;

  ALIAS_LOOKUP_DEFAULT_STATE = {
    fullText: "",
    name: "",
    domain: "",
  };

  aliasLookup = {
    ...this.ALIAS_LOOKUP_DEFAULT_STATE,
  };
  aliasLookupInProgress = {
    ...this.ALIAS_LOOKUP_DEFAULT_STATE,
  };
  aliasLookupLatestSuccessful = {
    ...this.ALIAS_LOOKUP_DEFAULT_STATE,
    address: "",
  };
  aliasResults$ = new BehaviorSubject([]);
  addressBookResults$ = new BehaviorSubject([]);
  isDestinationAccountAlias = false;
  showAddressBook = false;
  addressBookMatch = "";
  addressAliasMatch = "";

  amounts = [
    { name: "XNO", shortName: "XNO", value: "mnano" },
    { name: "knano", shortName: "knano", value: "knano" },
    { name: "nano", shortName: "nano", value: "nano" },
  ];
  selectedAmount = this.amounts[0];

  amount = null;
  amountExtraRaw = new BigNumber(0);
  amountFiat: number | null = null;
  rawAmount: BigNumber = new BigNumber(0);
  fromAccount: any = {};
  fromAccountID: any = "";
  fromAddressBook = "";
  toAccount: any = false;
  toAccountID = "";
  toOwnAccountID: any = "";
  toAddressBook = "";
  toAccountStatus = null;
  amountStatus = null;
  preparingTransaction = false;
  confirmingTransaction = false;
  selAccountInit = false;

  // NanoNym-specific state (receiving)
  isNanoNymAddress = false;
  nanoNymParsedKeys: {
    version: number;
    spendPublic: Uint8Array;
    viewPublic: Uint8Array;
    nostrPublic: Uint8Array;
  } | null = null;
  stealthAddress = "";
  ephemeralPublicKey: Uint8Array | null = null;

  // NanoNym spending state
  isSpendingFromNanoNym = false;
  selectedStealthAccounts: any[] = [];
  privacyWarningShown = false;
  privacyWarningDismissed = false;
  privacyWarningPending = false;

  constructor(
    private route: ActivatedRoute,
    private walletService: WalletService,
    private addressBookService: AddressBookService,
    private notificationService: NotificationService,
    private nodeApi: ApiService,
    private nanoBlock: NanoBlockService,
    public price: PriceService,
    private workPool: WorkPoolService,
    public settings: AppSettingsService,
    private util: UtilService,
    private qrModalService: QrModalService,
    private http: HttpClient,
    private translocoService: TranslocoService,
    private nanoNymCrypto: NanoNymCryptoService,
    public nostrService: NostrNotificationService,
    private nanoNymManager: NanoNymManagerService,
    private accountSelection: NanoNymAccountSelectionService,
  ) {}

  async ngOnInit() {
    const params = this.route.snapshot.queryParams;

    this.updateQueries(params);

    this.addressBookService.loadAddressBook();

    // Load all spendable accounts (regular + NanoNyms)
    this.loadSpendableAccounts();

    // Load privacy warning dismissed setting
    const dismissed = localStorage.getItem('nanonym-privacy-warning-dismissed');
    this.privacyWarningDismissed = dismissed === 'true';

    // Set default From account
    this.fromAccountID = this.accounts.length ? this.accounts[0].id : "";

    // Update selected account if changed in the sidebar
    this.walletService.wallet.selectedAccount$.subscribe(async (acc) => {
      if (this.activePanel !== "send") {
        // Transaction details already finalized
        return;
      }

      if (this.selAccountInit) {
        if (acc) {
          this.fromAccountID = acc.id;
        } else {
          this.findFirstAccount();
        }
      }
      this.selAccountInit = true;
    });

    // Update the account if query params changes. For example donation button while active on this page
    this.route.queryParams.subscribe((queries) => {
      this.updateQueries(queries);
    });

    // Set the account selected in the sidebar as default
    if (this.walletService.wallet.selectedAccount !== null) {
      this.fromAccountID = this.walletService.wallet.selectedAccount.id;
    } else {
      // If "total balance" is selected in the sidebar, use the first account in the wallet that has a balance
      this.findFirstAccount();
    }
  }

  updateQueries(params) {
    if (params && params.amount && !isNaN(params.amount)) {
      const amountAsRaw = new BigNumber(
        this.util.nano.mnanoToRaw(new BigNumber(params.amount)),
      );

      this.amountExtraRaw = amountAsRaw.mod(this.nano).floor();

      this.amount = this.util.nano
        .rawToMnano(amountAsRaw.minus(this.amountExtraRaw))
        .toNumber();

      this.syncFiatPrice();
    }

    if (params && params.to) {
      this.toAccountID = params.to;
      this.offerLookupIfDestinationIsAlias();
      this.validateDestination();
      this.sendDestinationType = "external-address";
    }
  }

  async findFirstAccount() {
    // Load balances before we try to find the right account
    if (this.walletService.wallet.balance.isZero()) {
      await this.walletService.reloadBalances();
    }

    // Look for the first account that has a balance
    const accountIDWithBalance = this.accounts.reduce((previous, current) => {
      if (previous) return previous;
      if (current.balance.gt(0)) return current.id;
      return null;
    }, null);

    if (accountIDWithBalance) {
      this.fromAccountID = accountIDWithBalance;
    }
  }

  // An update to the Nano amount, sync the fiat value
  syncFiatPrice() {
    if (!this.validateAmount() || Number(this.amount) === 0) {
      this.amountFiat = null;
      return;
    }
    const rawAmount = this.getAmountBaseValue(this.amount || 0).plus(
      this.amountExtraRaw,
    );
    if (rawAmount.lte(0)) {
      this.amountFiat = null;
      return;
    }

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

    this.amountFiat = fiatAmount;
  }

  // An update to the fiat amount, sync the nano value based on currently selected denomination
  syncNanoPrice() {
    if (!this.amountFiat) {
      this.amount = "";
      return;
    }
    if (!this.util.string.isNumeric(this.amountFiat)) return;
    const rawAmount = this.util.nano.mnanoToRaw(
      new BigNumber(this.amountFiat).div(this.price.price.lastPrice),
    );
    const nanoVal = this.util.nano.rawToNano(rawAmount).floor();
    const nanoAmount = this.getAmountValueFromBase(
      this.util.nano.nanoToRaw(nanoVal),
    );

    this.amount = nanoAmount.toNumber();
  }

  onDestinationAddressInput() {
    this.addressAliasMatch = "";
    this.addressBookMatch = "";

    this.offerLookupIfDestinationIsAlias();
    this.searchAddressBook();

    const destinationAddress = this.toAccountID || "";

    const nanoURIScheme = /^nano:.+$/g;
    const isNanoURI = nanoURIScheme.test(destinationAddress);

    if (isNanoURI === true) {
      const url = new URL(destinationAddress);

      if (this.util.account.isValidAccount(url.pathname)) {
        const amountAsRaw = url.searchParams.get("amount");

        const amountAsXNO = amountAsRaw
          ? nanocurrency
              .convert(amountAsRaw, {
                from: nanocurrency.Unit.raw,
                to: nanocurrency.Unit.NANO,
              })
              .toString()
          : null;

        setTimeout(() => {
          this.updateQueries({
            to: url.pathname,
            amount: amountAsXNO,
          });
        }, 10);
      }
    }
  }

  searchAddressBook() {
    this.showAddressBook = true;
    const search = this.toAccountID || "";
    const addressBook = this.addressBookService.addressBook;

    const matches = addressBook
      .filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
      .slice(0, 5);

    this.addressBookResults$.next(matches);
  }

  offerLookupIfDestinationIsAlias() {
    const destinationAddress = this.toAccountID || "";

    const mayBeAnAlias =
      destinationAddress.startsWith("@") === true &&
      destinationAddress.includes(".") === true &&
      destinationAddress.endsWith(".") === false &&
      destinationAddress.includes("/") === false &&
      destinationAddress.includes("?") === false;

    if (mayBeAnAlias === false) {
      this.isDestinationAccountAlias = false;
      this.aliasLookup = {
        ...this.ALIAS_LOOKUP_DEFAULT_STATE,
      };
      this.aliasResults$.next([]);
      return;
    }

    this.isDestinationAccountAlias = true;

    let aliasWithoutFirstSymbol = destinationAddress.slice(1).toLowerCase();

    if (aliasWithoutFirstSymbol.startsWith("_@") === true) {
      aliasWithoutFirstSymbol = aliasWithoutFirstSymbol.slice(2);
    }

    const aliasSplitResults = aliasWithoutFirstSymbol.split("@");

    let aliasName = "";
    let aliasDomain = "";

    if (aliasSplitResults.length === 2) {
      aliasName = aliasSplitResults[0];
      aliasDomain = aliasSplitResults[1];
    } else {
      aliasDomain = aliasSplitResults[0];
    }

    this.aliasLookup = {
      fullText: `@${aliasWithoutFirstSymbol}`,
      name: aliasName,
      domain: aliasDomain,
    };

    this.aliasResults$.next([{ ...this.aliasLookup }]);

    this.toAccountStatus = 1; // Neutral state
  }

  async lookupAlias() {
    if (this.aliasLookup.domain === "") {
      return;
    }

    if (this.settings.settings.decentralizedAliasesOption === "disabled") {
      const UIkit = window["UIkit"];
      try {
        await UIkit.modal.confirm(
          `<p class="uk-alert uk-alert-warning"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span>
          <span style="font-size: 18px;">
          ${this.translocoService.translate("configure-app.decentralized-aliases-require-external-requests")}
          </span>`,
          {
            labels: {
              cancel: this.translocoService.translate("general.cancel"),
              ok: this.translocoService.translate(
                "configure-app.allow-external-requests",
              ),
            },
          },
        );

        this.settings.setAppSetting("decentralizedAliasesOption", "enabled");
      } catch (err) {
        // pressed cancel, or a different error
        return;
      }
    }

    this.toAccountStatus = 1; // Neutral state

    const aliasLookup = { ...this.aliasLookup };

    const aliasFullText = aliasLookup.fullText;
    const aliasDomain = aliasLookup.domain;

    const aliasName = aliasLookup.name !== "" ? aliasLookup.name : "_";

    const lookupUrl = `https://${aliasDomain}/.well-known/nano-currency.json?names=${aliasName}`;

    this.aliasLookupInProgress = {
      ...aliasLookup,
    };

    await this.http
      .get<any>(lookupUrl)
      .toPromise()
      .then((res) => {
        const isOutdatedRequest =
          this.aliasLookupInProgress.fullText !== aliasFullText;

        if (isOutdatedRequest === true) {
          return;
        }

        this.aliasLookupInProgress = {
          ...this.ALIAS_LOOKUP_DEFAULT_STATE,
        };

        try {
          const aliasesInJsonCount =
            Array.isArray(res.names) === true ? res.names.length : 0;

          if (aliasesInJsonCount === 0) {
            this.toAccountStatus = 0; // Error state
            this.notificationService.sendWarning(
              `Alias @${aliasName} not found on ${aliasDomain}`,
            );
            return;
          }

          const matchingAccount = res.names.find(
            (account) => account.name === aliasName,
          );

          if (matchingAccount == null) {
            this.toAccountStatus = 0; // Error state
            this.notificationService.sendWarning(
              `Alias @${aliasName} not found on ${aliasDomain}`,
            );
            return;
          }

          if (!this.util.account.isValidAccount(matchingAccount.address)) {
            this.toAccountStatus = 0; // Error state
            this.notificationService.sendWarning(
              `Alias ${aliasFullText} does not have a valid address`,
            );
            return;
          }

          this.toAccountID = matchingAccount.address;

          this.aliasLookupLatestSuccessful = {
            ...aliasLookup,
            address: this.toAccountID,
          };

          this.onDestinationAddressInput();
          this.validateDestination();

          return;
        } catch (err) {
          this.toAccountStatus = 0; // Error state
          this.notificationService.sendWarning(
            `Unknown error has occurred while trying to lookup ${aliasFullText}`,
          );
          return;
        }
      })
      .catch((err) => {
        this.aliasLookupInProgress = {
          ...this.ALIAS_LOOKUP_DEFAULT_STATE,
        };
        this.toAccountStatus = 0; // Error state

        if (err.status === 404) {
          this.notificationService.sendWarning(
            `No aliases found on ${aliasDomain}`,
          );
        } else {
          this.notificationService.sendWarning(
            `Could not reach domain ${aliasDomain}`,
          );
        }

        return;
      });
  }

  selectBookEntry(account) {
    this.showAddressBook = false;
    this.toAccountID = account;
    this.isDestinationAccountAlias = false;
    this.searchAddressBook();
    this.validateDestination();
  }

  setSendDestinationType(newType: string) {
    this.sendDestinationType = newType;
  }

  async validateDestination() {
    // The timeout is used to solve a bug where the results get hidden too fast and the click is never registered
    setTimeout(() => (this.showAddressBook = false), 400);

    // Remove spaces from the account id
    this.toAccountID = this.toAccountID.replace(/ /g, "");

    // Check for NanoNym address BEFORE nano_ validation
    if (this.toAccountID.startsWith("nnym_")) {
      this.isNanoNymAddress = true;
      try {
        this.nanoNymParsedKeys = this.nanoNymCrypto.decodeNanoNymAddress(
          this.toAccountID,
        );
        this.toAccountStatus = 2; // Valid NanoNym address
      } catch (error) {
        this.toAccountStatus = 0; // Invalid NanoNym address
        this.notificationService.sendError(
          `Invalid NanoNym address: ${error.message}`,
        );
      }
      return; // Don't check as nano_ address
    }

    // Reset NanoNym state if not a NanoNym address
    this.isNanoNymAddress = false;
    this.nanoNymParsedKeys = null;

    this.addressAliasMatch =
      this.aliasLookupLatestSuccessful.address !== "" &&
      this.aliasLookupLatestSuccessful.address === this.toAccountID
        ? this.aliasLookupLatestSuccessful.fullText
        : null;

    if (this.isDestinationAccountAlias === true) {
      this.addressBookMatch = null;
      this.toAccountStatus = 1; // Neutral state
      return;
    }

    this.addressBookMatch =
      this.addressBookService.getAccountName(this.toAccountID) ||
      this.getAccountLabel(this.toAccountID, null);

    if (
      !this.addressBookMatch &&
      this.toAccountID === environment.donationAddress
    ) {
      this.addressBookMatch = "NanoNyms Development";
    }

    // const accountInfo = await this.walletService.walletApi.accountInfo(this.toAccountID);
    this.toAccountStatus = null;
    if (this.util.account.isValidAccount(this.toAccountID)) {
      const accountInfo = await this.nodeApi.accountInfo(this.toAccountID);
      if (accountInfo.error) {
        if (accountInfo.error === "Account not found") {
          this.toAccountStatus = 1;
        }
      }
      if (accountInfo && accountInfo.frontier) {
        this.toAccountStatus = 2;
      }
    } else {
      this.toAccountStatus = 0;
    }
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

  validateAmount() {
    if (this.util.account.isValidNanoAmount(this.amount)) {
      this.amountStatus = 1;
      return true;
    } else {
      this.amountStatus = 0;
      return false;
    }
  }

  getDestinationID() {
    if (this.sendDestinationType === "external-address") {
      return this.toAccountID;
    }

    // 'own-address'
    const walletAccount = this.walletService.wallet.accounts.find(
      (a) => a.id === this.toOwnAccountID,
    );

    if (!walletAccount) {
      // Unable to find receiving account in wallet
      return "";
    }

    if (this.toOwnAccountID === this.fromAccountID) {
      // Sending to the same address is only allowed via 'external-address'
      return "";
    }

    return this.toOwnAccountID;
  }

  async sendTransaction() {
    // Ensure the selected account is up-to-date before proceeding
    this.onFromAccountChange();

    // Handle sending TO NanoNym addresses with a separate flow
    if (this.isNanoNymAddress) {
      return await this.sendToNanoNym();
    }

    // Check if we're spending FROM a NanoNym
    if (this.selectedSpendableAccount?.type === 'nanonym') {
      return await this.sendFromNanoNym();
    }

    // Regular send flow
    const destinationID = this.getDestinationID();
    const isValid = this.util.account.isValidAccount(destinationID);
    if (!isValid) {
      return this.notificationService.sendWarning(
        `To account address is not valid`,
      );
    }
    if (!this.fromAccountID || !destinationID) {
      return this.notificationService.sendWarning(
        `From and to account are required`,
      );
    }
    if (!this.validateAmount()) {
      return this.notificationService.sendWarning(`Invalid XNO amount`);
    }

    this.preparingTransaction = true;

    const from = await this.nodeApi.accountInfo(this.fromAccountID);
    const to = await this.nodeApi.accountInfo(destinationID);

    this.preparingTransaction = false;

    if (!from) {
      return this.notificationService.sendError(`From account not found`);
    }

    from.balanceBN = new BigNumber(from.balance || 0);
    to.balanceBN = new BigNumber(to.balance || 0);

    this.fromAccount = from;
    this.toAccount = to;

    const rawAmount = this.getAmountBaseValue(this.amount || 0);
    this.rawAmount = rawAmount.plus(this.amountExtraRaw);

    const nanoAmount = this.rawAmount.div(this.nano);

    if (this.amount < 0 || rawAmount.lessThan(0)) {
      return this.notificationService.sendWarning(`Amount is invalid`);
    }
    if (from.balanceBN.minus(rawAmount).lessThan(0)) {
      return this.notificationService.sendError(
        `From account does not have enough XNO`,
      );
    }

    // Determine a proper raw amount to show in the UI, if a decimal was entered
    this.amountExtraRaw = this.rawAmount.mod(this.nano);

    // Determine fiat value of the amount
    this.amountFiat = this.util.nano
      .rawToMnano(rawAmount)
      .times(this.price.price.lastPrice)
      .toNumber();

    this.fromAddressBook =
      this.addressBookService.getAccountName(this.fromAccountID) ||
      this.getAccountLabel(this.fromAccountID, "Account");

    this.toAddressBook =
      this.addressBookService.getAccountName(destinationID) ||
      this.getAccountLabel(destinationID, null);

    // Start precomputing the work...
    this.workPool.addWorkToCache(this.fromAccount.frontier, 1);

    this.activePanel = "confirm";
  }

  async confirmTransaction() {
    // Handle spending FROM NanoNym (Section 8)
    if (this.isSpendingFromNanoNym) {
      return await this.confirmNanoNymSpend();
    }

    const walletAccount = this.walletService.wallet.accounts.find(
      (a) => a.id === this.fromAccountID,
    );
    if (!walletAccount) {
      throw new Error(`Unable to find sending account in wallet`);
    }
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();

      if (wasUnlocked === false) {
        return;
      }
    }

    this.confirmingTransaction = true;

    try {
      // Use stealth address for NanoNym, otherwise use regular destination
      const destinationID = this.isNanoNymAddress
        ? this.stealthAddress
        : this.getDestinationID();

      const newHash = await this.nanoBlock.generateSend(
        walletAccount,
        destinationID,
        this.rawAmount,
        this.walletService.isLedgerWallet(),
      );

      if (newHash) {
        // If NanoNym, send Nostr notification
        if (this.isNanoNymAddress) {
          await this.sendNostrNotification(newHash);
        }

        this.notificationService.removeNotification("success-send");
        this.notificationService.sendSuccess(
          `Successfully sent ${this.amount} ${this.selectedAmount.shortName}!`,
          { identifier: "success-send" },
        );
        this.resetForm();
      } else {
        if (!this.walletService.isLedgerWallet()) {
          this.notificationService.sendError(
            `There was an error sending your transaction, please try again.`,
          );
        }
      }
    } catch (err) {
      this.notificationService.sendError(
        `There was an error sending your transaction: ${err.message}`,
      );
    }

    this.confirmingTransaction = false;
  }

  /**
   * Confirm and execute spending from NanoNym stealth accounts (Section 8)
   * Sends multiple transactions, one from each selected stealth account
   */
  async confirmNanoNymSpend() {
    const destinationID = this.getDestinationID();

    this.confirmingTransaction = true;

    try {
      console.log(`[Send-NanoNym] Sending from ${this.selectedStealthAccounts.length} stealth accounts`);

      let totalSent = new BigNumber(0);
      let successCount = 0;
      const txHashes: string[] = [];

      // Send from each stealth account sequentially
      for (let i = 0; i < this.selectedStealthAccounts.length; i++) {
        const stealthAccount = this.selectedStealthAccounts[i];
        const accountBalance = new BigNumber(stealthAccount.amountRaw || stealthAccount.balance);

        // Calculate how much to send from this account
        const remaining = this.rawAmount.minus(totalSent);
        const amountToSend = BigNumber.min(accountBalance, remaining);

        console.log(`[Send-NanoNym] Account ${i + 1}/${this.selectedStealthAccounts.length}:`, {
          address: stealthAccount.address,
          balance: accountBalance.toString(),
          sending: amountToSend.toString()
        });

        // Create temporary wallet account for this stealth address
        const tempAccount = {
          id: stealthAccount.address,
          secret: stealthAccount.privateKey,
          keyPair: {
            publicKey: stealthAccount.publicKey,
            secretKey: stealthAccount.privateKey
          },
          index: -1, // Special index for stealth accounts
          frontier: null, // Will be fetched by generateSend
          balance: accountBalance,
          balanceRaw: accountBalance.mod(this.nano),
          pending: new BigNumber(0),
          pendingRaw: new BigNumber(0),
          balanceFiat: 0,
          pendingFiat: 0,
          addressBookName: null,
          receivePow: false
        };

        // Send the transaction
        const txHash = await this.nanoBlock.generateSend(
          tempAccount,
          destinationID,
          amountToSend,
          false // Never ledger for stealth accounts
        );

        if (txHash) {
          console.log(`[Send-NanoNym] ✅ Transaction ${i + 1} sent:`, txHash);
          txHashes.push(txHash);
          totalSent = totalSent.plus(amountToSend);
          successCount++;
        } else {
          console.error(`[Send-NanoNym] ❌ Transaction ${i + 1} failed`);
          // Continue trying other accounts even if one fails
        }

        // Optional: Add small delay for privacy mode (Section 8.4)
        // For now, send immediately (fast UX)
      }

      if (successCount > 0) {
        const sentXNO = this.util.nano.rawToMnano(totalSent).toFixed(6);
        this.notificationService.removeNotification("success-send");
        this.notificationService.sendSuccess(
          `Successfully sent ${sentXNO} XNO from ${successCount} stealth account${successCount > 1 ? 's' : ''}!`,
          { identifier: "success-send" }
        );

        console.log(`[Send-NanoNym] ✅ Complete:`, {
          totalSent: totalSent.toString(),
          successCount,
          txHashes
        });

        // Refresh NanoNym balances
        const nanoNymAccount = this.selectedSpendableAccount as NanoNymAccount;
        await this.nanoNymManager.refreshBalances(nanoNymAccount.index);

        this.resetForm();
      } else {
        this.notificationService.sendError(
          `Failed to send transactions from stealth accounts. Please try again.`
        );
      }
    } catch (err) {
      console.error('[Send-NanoNym] Error:', err);
      this.notificationService.sendError(
        `Error sending from NanoNym: ${err.message}`
      );
    }

    this.confirmingTransaction = false;
  }

  setMaxAmount() {
    // Handle NanoNym accounts differently
    if (this.selectedSpendableAccount?.type === 'nanonym') {
      const nanoNymAccount = this.selectedSpendableAccount as NanoNymAccount;
      this.amountExtraRaw = nanoNymAccount.balanceRaw;

      const nanoVal = this.util.nano.rawToNano(nanoNymAccount.balance).floor();
      const maxAmount = this.getAmountValueFromBase(
        this.util.nano.nanoToRaw(nanoVal),
      );
      this.amount = maxAmount.toNumber();
      this.syncFiatPrice();
      return;
    }

    // Regular wallet account
    const walletAccount = this.walletService.wallet.accounts.find(
      (a) => a.id === this.fromAccountID,
    );
    if (!walletAccount) {
      return;
    }

    this.amountExtraRaw = walletAccount.balanceRaw;

    const nanoVal = this.util.nano.rawToNano(walletAccount.balance).floor();
    const maxAmount = this.getAmountValueFromBase(
      this.util.nano.nanoToRaw(nanoVal),
    );
    this.amount = maxAmount.toNumber();
    this.syncFiatPrice();
  }

  resetRaw() {
    this.amountExtraRaw = new BigNumber(0);
  }

  getAmountBaseValue(value) {
    switch (this.selectedAmount.value) {
      default:
      case "nano":
        return this.util.nano.nanoToRaw(value);
      case "knano":
        return this.util.nano.knanoToRaw(value);
      case "mnano":
        return this.util.nano.mnanoToRaw(value);
    }
  }

  getAmountValueFromBase(value) {
    switch (this.selectedAmount.value) {
      default:
      case "nano":
        return this.util.nano.rawToNano(value);
      case "knano":
        return this.util.nano.rawToKnano(value);
      case "mnano":
        return this.util.nano.rawToMnano(value);
    }
  }

  // open qr reader modal
  openQR(reference, type) {
    const qrResult = this.qrModalService.openQR(reference, type);
    qrResult.then(
      (data) => {
        switch (data.reference) {
          case "account1":
            this.toAccountID = data.content;
            this.validateDestination();
            break;
        }
      },
      () => {},
    );
  }

  copied() {
    this.notificationService.removeNotification("success-copied");
    this.notificationService.sendSuccess(`Successfully copied to clipboard!`, {
      identifier: "success-copied",
    });
  }

  // NanoNym send flow
  async sendToNanoNym() {
    if (!this.fromAccountID || !this.nanoNymParsedKeys) {
      return this.notificationService.sendWarning(
        `From account and valid NanoNym address are required`,
      );
    }
    if (!this.validateAmount()) {
      return this.notificationService.sendWarning(`Invalid XNO amount`);
    }

    this.preparingTransaction = true;

    try {
      // 1. Generate ephemeral key for this payment
      const ephemeral = this.nanoNymCrypto.generateEphemeralKey();
      this.ephemeralPublicKey = ephemeral.public;

      // 2. Generate shared secret via ECDH
      const sharedSecret = this.nanoNymCrypto.generateSharedSecret(
        ephemeral.private,
        this.nanoNymParsedKeys.viewPublic,
      );

      // 3. Derive one-time stealth address
      const stealth = this.nanoNymCrypto.deriveStealthAddress(
        sharedSecret,
        ephemeral.public,
        this.nanoNymParsedKeys.spendPublic,
      );
      this.stealthAddress = stealth.address;

      // 4. Get account info for from and stealth address
      const from = await this.nodeApi.accountInfo(this.fromAccountID);
      const to = await this.nodeApi.accountInfo(this.stealthAddress);

      if (!from) {
        this.preparingTransaction = false;
        return this.notificationService.sendError(`From account not found`);
      }

      from.balanceBN = new BigNumber(from.balance || 0);
      to.balanceBN = new BigNumber(to.balance || 0);

      this.fromAccount = from;
      this.toAccount = to;

      // 5. Calculate raw amount (same as regular send flow)
      const rawAmount = this.getAmountBaseValue(this.amount || 0);
      this.rawAmount = rawAmount.plus(this.amountExtraRaw);

      if (this.amount < 0 || rawAmount.lessThan(0)) {
        this.preparingTransaction = false;
        return this.notificationService.sendWarning(`Amount is invalid`);
      }
      if (from.balanceBN.minus(rawAmount).lessThan(0)) {
        this.preparingTransaction = false;
        return this.notificationService.sendError(
          `From account does not have enough XNO`,
        );
      }

      // Determine a proper raw amount to show in the UI, if a decimal was entered
      this.amountExtraRaw = this.rawAmount.mod(this.nano);

      // Determine fiat value of the amount
      this.amountFiat = this.util.nano
        .rawToMnano(rawAmount)
        .times(this.price.price.lastPrice)
        .toNumber();

      this.fromAddressBook =
        this.addressBookService.getAccountName(this.fromAccountID) ||
        this.getAccountLabel(this.fromAccountID, "Account");

      this.toAddressBook = "";

      // Start precomputing the work...
      this.workPool.addWorkToCache(this.fromAccount.frontier, 1);

      this.preparingTransaction = false;
      this.activePanel = "confirm";
    } catch (err) {
      this.preparingTransaction = false;
      this.notificationService.sendError(
        `Error preparing NanoNym transaction: ${err.message}`,
      );
    }
  }

  async sendNostrNotification(txHash: string) {
    if (!this.ephemeralPublicKey || !this.nanoNymParsedKeys) {
      console.error("Missing ephemeral key or NanoNym keys for notification");
      return;
    }

    try {
      const senderNostrKey = this.nanoNymCrypto.generateEphemeralKey();
      const notification = {
        version: 1,
        protocol: "nanoNymNault",
        R: this.bytesToHex(this.ephemeralPublicKey),
        tx_hash: txHash,
        amount: this.amount?.toString() || "",
        amount_raw: this.rawAmount.toString(),
      };

      console.log("[Send] Preparing Nostr notification:", {
        tx_hash: txHash,
        ephemeralPublicKey_hex: this.bytesToHex(this.ephemeralPublicKey),
        receiverNostrPublic_hex: this.bytesToHex(
          this.nanoNymParsedKeys.nostrPublic,
        ),
        notification: notification,
      });

      const acceptedRelays = await this.nostrService.sendNotification(
        notification,
        senderNostrKey.private,
        this.nanoNymParsedKeys.nostrPublic,
      );
      console.log(
        `[Send] Nostr notification sent to ${acceptedRelays.length} relays:`,
        acceptedRelays,
      );
    } catch (error) {
      console.error("[Send] Failed to send Nostr notification:", error);
      this.notificationService.sendWarning(
        "Transaction sent but notification failed. Recipient may not see payment immediately.",
      );
    }
  }

  /**
   * Send flow when spending FROM a NanoNym (Section 8)
   */
  async sendFromNanoNym() {
    const nanoNymAccount = this.selectedSpendableAccount as NanoNymAccount;
    const destinationID = this.getDestinationID();

    // Validate inputs
    const isValid = this.util.account.isValidAccount(destinationID);
    if (!isValid) {
      return this.notificationService.sendWarning(`To account address is not valid`);
    }
    if (!destinationID) {
      return this.notificationService.sendWarning(`Destination account is required`);
    }
    if (!this.validateAmount()) {
      return this.notificationService.sendWarning(`Invalid XNO amount`);
    }

    this.preparingTransaction = true;

    try {
      const rawAmount = this.getAmountBaseValue(this.amount || 0);
      this.rawAmount = rawAmount.plus(this.amountExtraRaw);

      if (this.amount < 0 || rawAmount.lessThan(0)) {
        this.preparingTransaction = false;
        return this.notificationService.sendWarning(`Amount is invalid`);
      }

      // Use account selection algorithm to pick stealth accounts
      const selectionResult = this.accountSelection.selectAccountsForSend(
        this.rawAmount,
        nanoNymAccount.nanoNym.stealthAccounts
      );

      if (selectionResult.accounts.length === 0) {
        this.preparingTransaction = false;
        return this.notificationService.sendError(
          `Insufficient balance in ${nanoNymAccount.label}. Available: ${this.util.nano.rawToMnano(nanoNymAccount.balance).toFixed(6)} XNO`
        );
      }

      // Store selected stealth accounts for confirmation
      this.selectedStealthAccounts = selectionResult.accounts;
      this.isSpendingFromNanoNym = true;

      console.log('[Send-NanoNym] Account selection result:', {
        requested: this.rawAmount.toString(),
        accountsSelected: selectionResult.accounts.length,
        totalBalance: selectionResult.totalBalance.toString(),
        requiresMultiple: selectionResult.requiresMultipleAccounts
      });

      // Get destination info
      const to = await this.nodeApi.accountInfo(destinationID);
      to.balanceBN = new BigNumber(to.balance || 0);
      this.toAccount = to;

      // Set from account info (aggregate)
      this.fromAccount = {
        balance: nanoNymAccount.balance.toString(),
        balanceBN: nanoNymAccount.balance,
      };

      // Determine a proper raw amount to show in the UI
      this.amountExtraRaw = this.rawAmount.mod(this.nano);

      // Determine fiat value
      this.amountFiat = this.util.nano
        .rawToMnano(this.rawAmount)
        .times(this.price.price.lastPrice)
        .toNumber();

      this.fromAddressBook = nanoNymAccount.label;
      this.toAddressBook =
        this.addressBookService.getAccountName(destinationID) ||
        this.getAccountLabel(destinationID, null);

      this.preparingTransaction = false;

      // Check if privacy warning should be shown (Section 8.3)
      const privacyImpact = this.accountSelection.calculatePrivacyImpact(selectionResult);
      const shouldShowWarning = (
        selectionResult.requiresMultipleAccounts &&
        !this.privacyWarningDismissed &&
        !this.privacyWarningShown
      );

      console.log('[Send-NanoNym] Privacy check:', {
        requiresMultiple: selectionResult.requiresMultipleAccounts,
        dismissed: this.privacyWarningDismissed,
        shown: this.privacyWarningShown,
        shouldShow: shouldShowWarning,
        impact: privacyImpact
      });

      if (shouldShowWarning) {
        this.privacyWarningPending = true;
        this.showPrivacyWarning();
        return; // Don't proceed to confirm panel yet
      }

      this.activePanel = "confirm";
    } catch (err) {
      this.preparingTransaction = false;
      this.notificationService.sendError(
        `Error preparing NanoNym send: ${err.message}`
      );
    }
  }

  resetForm() {
    this.activePanel = "send";
    this.amount = null;
    this.amountFiat = null;
    this.resetRaw();
    this.toAccountID = "";
    this.toOwnAccountID = "";
    this.toAccountStatus = null;
    this.fromAddressBook = "";
    this.toAddressBook = "";
    this.addressBookMatch = "";
    this.addressAliasMatch = "";
    this.isNanoNymAddress = false;
    this.nanoNymParsedKeys = null;
    this.stealthAddress = "";
    this.ephemeralPublicKey = null;
    this.isSpendingFromNanoNym = false;
    this.selectedStealthAccounts = [];
    this.privacyWarningShown = false;
  }

  bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Load all spendable accounts (regular wallet accounts + NanoNyms)
   */
  loadSpendableAccounts(): void {
    const nano = new BigNumber(this.nano);

    // Convert regular wallet accounts to SpendableAccount format
    const regularAccounts: RegularAccount[] = this.accounts.map(account => ({
      type: 'regular' as const,
      id: account.id,
      label: account.addressBookName || `Account #${account.index}`,
      balance: account.balance,
      balanceRaw: account.balanceRaw,
      pending: account.pending,
      balanceFiat: account.balanceFiat,
      index: account.index,
      walletAccount: account
    }));

    // Get NanoNym accounts
    const nanoNymAccounts = this.nanoNymManager.getSpendableNanoNymAccounts();

    // Calculate fiat values for NanoNyms
    nanoNymAccounts.forEach(account => {
      account.balanceFiat = this.util.nano.rawToMnano(account.balance)
        .times(this.price.price.lastPrice)
        .toNumber();
    });

    // Combine both types
    this.spendableAccounts = [...regularAccounts, ...nanoNymAccounts];

    console.log('[Send] Loaded spendable accounts:', {
      regular: regularAccounts.length,
      nanoNym: nanoNymAccounts.length,
      total: this.spendableAccounts.length
    });
  }

  /**
   * Format account label for dropdown display
   * Regular: "Account #0 (10.5 XNO)"
   * NanoNym: "Donations - nnym_12345...67890 (2.5 XNO)"
   */
  formatAccountLabel(account: SpendableAccount): string {
    return formatSpendableAccountLabel(
      account,
      (raw: BigNumber) => this.util.nano.rawToMnano(raw).toFixed(6).replace(/\.?0+$/, '')
    );
  }

  /**
   * Handle fromAccountID changes
   * Find the corresponding SpendableAccount
   */
  onFromAccountChange(): void {
    const selected = this.spendableAccounts.find(acc => acc.id === this.fromAccountID);
    this.selectedSpendableAccount = selected || null;

    console.log('[Send] Selected account:', {
      type: selected?.type,
      id: selected?.id,
      label: selected?.label,
      balance: selected?.balance.toString()
    });
  }

  /**
   * Show privacy warning modal (Section 8.3)
   */
  showPrivacyWarning(): void {
    const UIkit = window['UIkit'];
    UIkit.modal('#nanonym-privacy-warning-modal').show();
  }

  /**
   * User accepted privacy warning and wants to proceed
   */
  acceptPrivacyWarning(): void {
    const UIkit = window['UIkit'];
    UIkit.modal('#nanonym-privacy-warning-modal').hide();

    // Save dismissed setting if checkbox was checked
    if (this.privacyWarningDismissed) {
      localStorage.setItem('nanonym-privacy-warning-dismissed', 'true');
      console.log('[Send-NanoNym] Privacy warning dismissed permanently');
    }

    this.privacyWarningShown = true;
    this.privacyWarningPending = false;

    // Now proceed to confirmation panel
    this.activePanel = "confirm";
  }
}
