import { Injectable } from '@angular/core';
import * as Rx from 'rxjs';

type NotificationType = 'info'|'success'|'warning'|'error';

@Injectable({ providedIn: 'root' })
export class NotificationService {

  notifications$ = new Rx.BehaviorSubject(null);
  removeNotification$ = new Rx.BehaviorSubject(null);

  constructor() { }

  // This provides an entry point for all components to send notifications.
  // It exposes an observable that the actual component uses to grab new notifications

  sendNotification(type: NotificationType, message: string, options = {}) {
    // Log all notifications to console for debugging/capture
    const logPrefix = '[Notification]';
    switch (type) {
      case 'error':
        console.error(logPrefix, '💥', message);
        break;
      case 'warning':
        console.warn(logPrefix, '⚠️', message);
        break;
      case 'success':
        console.log(logPrefix, '✅', message);
        break;
      case 'info':
      default:
        console.debug(logPrefix, 'ℹ️', message);
        break;
    }
    this.notifications$.next({ type, message, options });
  }

  removeNotification(identifier: string) {
    this.removeNotification$.next(identifier);
  }

  sendInfo(message: string, options = {}) {
    this.sendNotification('info', message, options);
  }
  sendSuccess(message: string, options = {}) {
    this.sendNotification('success', message, options);
  }
  sendWarning(message: string, options = {}) {
    this.sendNotification('warning', message, options);
  }
  sendError(message: string, options = {}) {
    this.sendNotification('error', message, options);
  }

  // Custom notification functions - these are re-used in multiple paces through the app
  sendLedgerChromeWarning() {
    this.sendWarning(
      `<b>Notice:</b> You may experience issues using a Ledger device with Google Chrome. ` +
      `If you do please use Brave/Opera browser or ` +
      `<a href="https://github.com/Nault/Nault/releases" target="_blank" rel="noopener noreferrer">Nault Desktop</a>.`,
      { length: 0, identifier: 'chrome-ledger' }
      );
  }

}
