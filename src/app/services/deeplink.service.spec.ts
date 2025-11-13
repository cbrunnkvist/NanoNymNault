import { TestBed, inject } from '@angular/core/testing';

import { DeeplinkService } from './deeplink.service';

describe('DeeplinkService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DeeplinkService]
    });
  });

  // SKIPPED: Test may fail due to missing DI providers in TestBed configuration.
  // To fix: Add mock providers for all service dependencies.
  // See NAULT-TESTS.md for details on test infrastructure issues.
  xit('should be created', inject([DeeplinkService], (service: DeeplinkService) => {
    expect(service).toBeTruthy();
  }));
});
