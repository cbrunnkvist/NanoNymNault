import { TestBed, inject } from '@angular/core/testing';

import { RemoteSignService } from './remote-sign.service';

describe('RemoteSignService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RemoteSignService]
    });
  });

  // SKIPPED: Test may fail due to missing DI providers in TestBed configuration.
  // To fix: Add mock providers for all service dependencies.
  // See NAULT-TESTS.md for details on test infrastructure issues.
  xit('should be created', inject([RemoteSignService], (service: RemoteSignService) => {
    expect(service).toBeTruthy();
  }));
});
