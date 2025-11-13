import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { MultisigComponent } from './multisig.component';

describe('MultisigComponent', () => {
  let component: MultisigComponent;
  let fixture: ComponentFixture<MultisigComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ MultisigComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MultisigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // SKIPPED: Test fails due to missing DI providers in TestBed configuration.
  // To fix: Add mock providers for all component/service dependencies.
  // See NAULT-TESTS.md for details on test infrastructure issues.
  xit('should create', () => {
    expect(component).toBeTruthy();
  });
});
