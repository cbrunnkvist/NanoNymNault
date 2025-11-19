import { Injectable } from '@angular/core';
import { ApiService } from '../../src/app/services/api.service';
import { of } from 'rxjs';

@Injectable()
export class MockApiService extends ApiService {
  accountInfo = jasmine.createSpy('accountInfo').and.returnValue(of({
    account_version: "0",
    balance: "10000000000000000000000000000000000000", // A large balance in raw
    block_count: "1",
    frontier: "0000000000000000000000000000000000000000000000000000000000000000",
    modified_timestamp: "1678886400",
    open_block: "0000000000000000000000000000000000000000000000000000000000000000",
    pending: "0",
    representative: "nano_1natrium1o3z551dkifxipxzcgh7mbufz1p39b68u454yje5dqk4e7bcawig",
    representative_block: "0000000000000000000000000000000000000000000000000000000000000000",
    weight: "10000000000000000000000000000000000000"
  }).toPromise());
  // Add other methods from ApiService that are called during the send flow
}
