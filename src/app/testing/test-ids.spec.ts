import { TestIds } from './test-ids';

describe('TestIds', () => {
  it('should have a defined app.root test ID', () => {
    expect(TestIds.app.root).toBeDefined();
    expect(TestIds.app.root).toEqual('app-root');
  });

  it('should have a defined welcome.pageRoot test ID', () => {
    expect(TestIds.welcome.pageRoot).toBeDefined();
    expect(TestIds.welcome.pageRoot).toEqual('welcome-page-root');
  });

  it('should have a defined receive.pageRoot test ID', () => {
    expect(TestIds.receive.pageRoot).toBeDefined();
    expect(TestIds.receive.pageRoot).toEqual('receive-page-root');
  });

  it('should have a defined accounts.pageRoot test ID', () => {
    expect(TestIds.accounts.pageRoot).toBeDefined();
    expect(TestIds.accounts.pageRoot).toEqual('accounts-page-root');
  });

  it('should have a defined addressBook.pageRoot test ID', () => {
    expect(TestIds.addressBook.pageRoot).toBeDefined();
    expect(TestIds.addressBook.pageRoot).toEqual('address-book-page-root');
  });

  it('should have a defined representatives.pageRoot test ID', () => {
    expect(TestIds.representatives.pageRoot).toBeDefined();
    expect(TestIds.representatives.pageRoot).toEqual('representatives-page-root');
  });

  it('should have a defined appSettings.pageRoot test ID', () => {
    expect(TestIds.appSettings.pageRoot).toBeDefined();
    expect(TestIds.appSettings.pageRoot).toEqual('app-settings-page-root');
  });

  it('should have a defined manageWallet.pageRoot test ID', () => {
    expect(TestIds.manageWallet.pageRoot).toBeDefined();
    expect(TestIds.manageWallet.pageRoot).toEqual('manage-wallet-page-root');
  });
});
