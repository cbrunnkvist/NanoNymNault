import { AccountPipe } from "./account.pipe";
import { TestBed } from "@angular/core/testing";
import { UtilService } from "../services/util.service";
import { AppSettingsService } from "../services/app-settings.service";

describe("AccountPipe", () => {
  it("create an instance", () => {
    const utilService = {} as UtilService;
    const settingsService = {} as AppSettingsService;
    const pipe = new AccountPipe(utilService, settingsService);
    expect(pipe).toBeTruthy();
  });
});
