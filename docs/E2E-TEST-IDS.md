# Test ID policy

## Purpose

`data-testid` is a **public UI API** for tests and dev–QA communication. It must:

- Disambiguate both **what** a thing is and **where** it belongs in the product
- Stay stable through layout/visual changes
- Avoid overly long or over-specified names

Test IDs are applied only to elements that matter for behavior, business data, or critical flows.

---

## Attribute

- Use`data-testid` as the standard attribute.
- Treat each`data-testid` value as a stable contract:
    - Renaming is a breaking change that must be coordinated with test owners.

---

## Where to add data-testid

Add test IDs to:

1. **Global shell elements**
    - Always-present parts of the UI.
    - Example (hypothetical):
        - App header container:`app-header-root`
        - Global notifications icon:`app-header-notifications-button`

2. **Feature/page roots**
    - Main container for each feature or page.
    - Examples:
        -`orders-page-root`
        -`profile-page-root`
        -`admin-dashboard-root`

3. **Key domain data points**
    - Values that matter to the business.
    - Examples:
        -`orders-summary-total-value`
        -`portfolio-overview-balance-value`
        -`user-profile-status-value`

4. **Primary interactions**
    - Buttons/links/toggles that trigger important actions.
    - Examples:
        -`orders-submit-button`
        -`profile-save-button`
        -`admin-user-delete-button`

5. **Repeated domain units**
    - Rows/cards representing business entities.
    - Examples:
        -`orders-row`
        -`customers-row`
        -`notifications-item`

Avoid adding test IDs to:

- Purely visual/layout wrappers (grid/flex divs, spacer elements)
- Elements that are uniquely and robustly discoverable via accessible name/role (e.g. a single “Log out” button with stable text)

---

## Naming pattern

Each`data-testid` should encode:

1. A **scope** (where in the product)
2. A **domain entity** (what concept)
3. A **role** (what kind of element)
4. An optional **variant** (only when needed)

Pattern:

`<scope>-<entity>-<role>[-<variant>]`

- **scope**: app-wide, feature, or module context
    - Examples:`app-header`,`orders`,`profile`,`dashboard`,`admin-users`
- **entity**: domain term
    - Examples:`order`,`user`,`balance`,`fee`,`notification`
- **role**: type of element
    - Examples:`value`,`label`,`button`,`input`,`row`,`summary`,`total`,`badge`
- **variant** (optional): extra qualifier only when absolutely needed
    - Examples:`primary`,`secondary`,`header`,`details`,`compact`

Guidelines:

- Use **domain language**, not layout or styling:
    -`orders-summary-total-value`, not`right-panel-total` or`blue-total-text`.
- Use the **minimum scope and variant** needed to be unambiguous:
    - If two different “status” values exist in a feature, distinguish them:
        -`orders-header-status-value`
        -`orders-details-status-value`
- Reuse entity terms consistently across the app (e.g. always`balance`, not sometimes`balance` and sometimes`amount` when they mean the same thing).

---

## Hypothetical examples

These examples are not tied to any particular product; they demonstrate the pattern.

- Global app header:
    - Root:`app-header-root`
    - Global user menu button:`app-header-user-menu-button`

- Orders list page:
    - Page root:`orders-page-root`
    - “Create order” button:`orders-create-button`
    - Each order row:`orders-row`
    - Order ID cell in a row:`orders-row-id-value`
    - Order total in a row:`orders-row-total-value`

- Order details page:
    - Page root:`order-details-page-root`
    - Main total:`order-details-total-value`
    - Shipping fee:`order-details-shipping-fee-value`

- Dashboard with summary and table:
    - Summary “overall balance” card:`dashboard-balance-summary-value`
    - Table of accounts:
        - Row:`dashboard-accounts-row`
        - Account name:`dashboard-accounts-row-name-value`
        - Account balance:`dashboard-accounts-row-balance-value`

If a similar concept appears in both header and dashboard, the scope distinguishes them clearly:
-`app-header-balance-value`
-`dashboard-balance-summary-value`

---

## Repeated items: rows, cards, lists

For repeated entities:

- Use the same test ID for each repeated **unit**:
    -`data-testid="orders-row"`
- Inside, give important fields their own test IDs:
    -`data-testid="orders-row-id-value"`
    -`data-testid="orders-row-status-value"`

To identify a specific instance, add a **separate domain-specific data attribute**:

```html
<tr
  [attr.data-testid]="'orders-row'"
  [attr.data-order-id]="order.id">
  <td data-testid="orders-row-id-value">
    {{ order.id }}
  </td>
  <td data-testid="orders-row-status-value">
    {{ order.status }}
  </td>
</tr>
```

Tests can then do:

- “Find`orders-row` with`data-order-id="12345"` and check`orders-row-status-value`.”

---

## DOs and DON’Ts

**DO**

- Use product/feature names in`scope`.
- Use domain terms in`entity` (`order`,`user`,`balance`,`fee`).
- Keep names as short as possible while still unambiguous.
- Treat`data-testid` values as a public API between frontend and tests.
- Use extra`data-*` attributes to encode IDs or domain selectors when needed.

**DON’T**

- Use layout, color, or position: no`left`,`right`,`top`,`column3`,`blue`.
- Encode full navigation paths: no`orders-tab-main-subtab-details`.
- Put dynamic values or state into the`data-testid` itself:
    - No`order-12345-row` or`status-expanded`.
    - Use`data-order-id="12345"` plus a stable test ID instead.

---

# Strategy for adding test IDs to legacy Angular apps

## 1. Centralize test ID definitions

Create a shared file, e.g.`test-ids.ts`, as the single source of truth:

```ts
export const TestIds = {
  appHeader: {
    root: 'app-header-root',
    userMenuButton: 'app-header-user-menu-button'
  },
  orders: {
    pageRoot: 'orders-page-root',
    createButton: 'orders-create-button',
    row: 'orders-row',
    rowIdValue: 'orders-row-id-value',
    rowStatusValue: 'orders-row-status-value'
  },
  orderDetails: {
    pageRoot: 'order-details-page-root',
    totalValue: 'order-details-total-value'
  }
} as const;
```

This allows both developers and testers to refer to the same named constants.

---

## 2. Bind test IDs in Angular templates

Expose the constants in the component:

```ts
import { Component } from '@angular/core';
import { TestIds } from '../testing/test-ids';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html'
})
export class OrdersComponent {
  readonly testIds = TestIds;
}
```

Use them via attribute bindings:

```html
<section [attr.data-testid]="testIds.orders.pageRoot">
  <button
    type="button"
    [attr.data-testid]="testIds.orders.createButton">
    Create order
  </button>

  <table>
    <tr *ngFor="let order of orders"
        [attr.data-testid]="testIds.orders.row"
        [attr.data-order-id]="order.id">
      <td [attr.data-testid]="testIds.orders.rowIdValue">
        {{ order.id }}
      </td>
      <td [attr.data-testid]="testIds.orders.rowStatusValue">
        {{ order.status }}
      </td>
    </tr>
  </table>
</section>
```

For component roots, you can use`@HostBinding`:

```ts
@Component({
  selector: 'app-order-details',
  templateUrl: './order-details.component.html'
})
export class OrderDetailsComponent {
  @HostBinding('attr.data-testid')
  readonly testId = TestIds.orderDetails.pageRoot;

  readonly testIds = TestIds;
}
```

---

## 3. Prioritize and incrementally retrofit

For a legacy app:

1. Identify:
    - Critical user flows (authentication, primary business workflows, payments, etc.)
    - Ambiguous or reused concepts (totals, balances, statuses, fees, etc.)
2. For those areas:
    - Add a page/feature root test ID.
    - Add test IDs to the key actions and domain values using the naming policy.
3. Update or create tests to use`data-testid` selectors instead of brittle CSS/XPath.

Do this gradually when you touch a feature, rather than trying to tag the entire app at once.

---

## 4. Encapsulate selectors in test-side helpers

In test code (Cypress, Playwright, etc.), avoid scattering raw selectors. Use page objects or selector modules:

```ts
export const OrdersSelectors = {
  pageRoot: '[data-testid="orders-page-root"]',
  createButton: '[data-testid="orders-create-button"]',
  row: '[data-testid="orders-row"]',
  rowStatusValue: '[data-testid="orders-row-status-value"]'
};
```

This keeps test code aligned with the names defined in`test-ids.ts`.

---

## 5. Treat test IDs as a maintained API

- Add new test IDs when new features or flows are built.
- Avoid renaming existing ones; if renaming is necessary, coordinate it like any other breaking change.
- Keep this policy and`test-ids.ts` in the repository so new code follows the same conventions.

---

# Rules-of-thumb when adding ARIA & testid attributes

- Interactive control with clear visible text
  DO: Use the real element and its text in tests (e.g.`button` with label “Save”; test via role/name: “click the Save button”).
  DON’T: Add`data-testid` or`aria-*` just to make this button easier to select.

- Input with a proper label
  DO: Pair`<label>` with`<input>` and test via the label text (“Email” field).
  DON’T: Add both`aria-label` and`data-testid` to the same input just to have more selector options.

- Control that is only an icon (no text)
  DO: Pick one primary hook. Prefer`data-testid="settings-button"` if you mainly care about testing; or`aria-label="Open settings"` if you’re explicitly improving accessibility.
  DON’T: Put *both*`aria-label="Open settings"` and`data-testid="settings-button"` unless you have a concrete accessibility requirement that demands ARIA.

- Non-interactive domain values (totals, balances, fees, statuses, etc.)
  DO: Use`data-testid` (e.g.`orders-summary-total-value`) as the single, clear hook for tests.
  DON’T: Invent`aria-label` or`role` just so tests can query it; that over-describes something users don’t navigate by.

- Repeated domain items (rows/cards in lists and tables)
  DO: Use one`data-testid` per unit (e.g.`orders-row`) plus optional`data-*` domain attributes (e.g.`data-order-id="123"`), and`data-testid` for important child fields (e.g.`orders-row-total-value`).
  DON’T: Add multiple overlapping hooks on the same element (`aria-label`,`title`,`data-testid`,`id`, etc.) when`data-testid` + a domain attribute is enough.

- When a feature already has strong accessibility hooks
  DO: Use the existing labels/roles in tests *instead of* adding`data-testid` (e.g. “Log out” button with clear text).
  DON’T: Add a duplicate`data-testid` that says the same thing unless you have a real test stability problem that label-based queries can’t solve.

- When you’re unsure which hook to add
  DO: Prefer a single`data-testid` following the naming policy (`<scope>-<entity>-<role>[-<variant>]`) because it’s explicit and stable for tests.
  DON’T: Add`aria-*` and`data-testid` together “just in case”; pick one that best serves the primary need (in this guide: testing).

- Refactoring or reviewing existing components
  DO: Remove redundant selector hooks where safe, and converge on **one** main hook per element (usually`data-testid` for internal values, text/label for user-visible controls).
  DON’T: Let elements accumulate multiple overlapping ways to address them (`id`,`class`,`aria-*`,`data-testid`) without a specific reason; that’s how ambiguity and miscommunication happen.
