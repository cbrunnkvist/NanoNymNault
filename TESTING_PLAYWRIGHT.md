# Playwright Testing Guide

## 1. Quick Start
- Prerequisites (nvm use).
- Running tests (headless vs UI).

## 2. Tester's Workflow (Iterating & Expanding)
- **Recommended**: Use **Playwright UI Mode** (`npm run e2e:pw:ui`).
  - Explain how to hover over elements to see selectors.
  - Explain the "Pick Locator" tool (eye dropper icon) to copy selectors.
  - Explain "Watch mode" to auto-run tests on file save.

## 3. Handling "No Test IDs"
- **Philosophy**: Playwright prefers user-facing locators (Role, Text, Label) over test-ids. 
- **Best Practice Hierarchy**:
  1. `getByRole('button', { name: 'Submit' })` (Best - behaves like a user)
  2. `getByLabel('Email')`
  3. `getByText('Welcome')`
  4. `getByTestId('submit-btn')` (Only if necessary)
  5. `locator('css=.class')` (Avoid if possible)

## 4. How to collaborate with the AI
- **Problem**: "I don't know how to describe the icon to the right of..."
- **Solution**: 
  1. Open UI Mode (`npm run e2e:pw:ui`).
  2. Click "Pick Locator".
  3. Click the element.
  4. Copy the locator string (e.g., `getByRole('button', { name: 'Settings' })`).
  5. Paste that into your chat with the AI: "Please add a test for clicking [PASTE LOCATOR HERE]".
  
  This empowers the tester to give precise instructions without needing to inspect HTML code or add test-ids manually.
