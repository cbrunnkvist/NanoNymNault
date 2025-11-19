import { browser, by, element, ExpectedConditions } from 'protractor';

export class NanoNymSendPage {
  navigateTo(): Promise<unknown> {
    return browser.get(browser.baseUrl) as Promise<unknown>;
  }

  navigateToSendPage(): Promise<unknown> {
    return browser.get(browser.baseUrl + '/send') as Promise<unknown>;
  }

  // Assuming a way to select the NanoNym account from a dropdown or similar
  // This will heavily depend on the actual UI implementation
  async selectNanoNymAccount(accountLabel: string): Promise<void> {
    // This is a placeholder. Real implementation would interact with UI elements.
    console.log(`Simulating selection of NanoNym account: ${accountLabel}`);
    // Example: Click on a dropdown, find item by text, and click it
    // await element(by.id('from-account-dropdown')).click();
    // await element(by.cssContainingText('.dropdown-item', accountLabel)).click();
  }

  async setDestinationAddress(address: string): Promise<void> {
    const destinationInput = element(by.id('send-address'));
    await destinationInput.sendKeys(address);
  }

  async setSendAmount(amount: string): Promise<void> {
    const amountInput = element(by.id('send-amount'));
    await amountInput.sendKeys(amount);
  }

  async clickSendButton(): Promise<void> {
    const sendButton = element(by.id('send-button'));
    await sendButton.click();
  }

  async confirmPrivacyWarning(): Promise<void> {
    const confirmButton = element(by.id('privacy-warning-confirm-button'));
    // Wait for the warning modal/dialog to appear
    await browser.wait(ExpectedConditions.visibilityOf(confirmButton), 5000, 'Privacy warning did not appear');
    await confirmButton.click();
  }

  // You might need methods to check for success messages or current URL
  async getSuccessMessage(): Promise<string> {
    const successToast = element(by.css('.toast-success')); // Assuming a class for success toasts
    await browser.wait(ExpectedConditions.visibilityOf(successToast), 5000, 'Success message did not appear');
    return successToast.getText();
  }

  async getCurrentUrl(): Promise<string> {
    return browser.getCurrentUrl();
  }
}
