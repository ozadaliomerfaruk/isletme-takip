# Test Improvement Plan

## Current State

The project has **zero test infrastructure** -- no test framework, no test files, no coverage tooling. Given the complexity of this financial management app (13+ transaction types, multi-currency support, 30+ hooks, 1500+ line import logic), this is a significant risk area.

---

## Pre-requisite Refactor: Extract `computeBalanceEffects()`

**Do this before writing any Priority 2 tests.** This is the single highest-leverage change in the entire plan.

Currently the 13-case balance switch is buried inside a mutation hook that talks to Supabase. Testing it means mocking the entire hook, Supabase client, query client, auth context -- and the test becomes 80% setup, 20% assertion.

### What to extract

```typescript
// src/lib/balanceEffects.ts

type BalanceEffect = {
  entityType: 'hesap' | 'cari' | 'personel';
  entityId: string;
  delta: number;
  currency: Currency;
};

function computeBalanceEffects(
  transaction: IslemInsert,
  context: { sourceCurrency: Currency; targetCurrency: Currency; exchangeRate: number }
): BalanceEffect[];
```

### What stays in `useIslemler.ts`

The hook becomes an orchestrator: write tx -> apply deltas -> rollback on failure. No business logic.

### Why this matters

- Makes all 13 transaction types testable as pure function calls with zero mocking
- Makes ledger invariant tests (net change = 0 for transfers, currency conservation) trivial
- Makes rollback testing straightforward: assert effects, then assert reverse effects
- Eliminates the "works in mocks, fails in prod" risk for the most critical logic

---

## Priority 1: Critical -- Financial Calculation Logic

Pure functions with no UI dependencies. Easiest to test and most dangerous to get wrong.

### `src/lib/currency.ts` (520 lines)

#### Example-based tests

- `parseCurrency()` -- Turkish (1.234,56) vs English (1,234.56) format parsing
- `calculateTargetAmount()` -- Cross-currency conversion (TRY<->USD, EUR<->GBP). Edge cases: rate=0, same currency, two foreign currencies
- `safeParseAmount()` / `safeParseExchangeRate()` -- Validation boundaries
- `formatCurrencyInput()` / `unformatCurrencyInput()` -- Round-trip consistency (format then parse should equal original)
- Floating-point precision: `Math.round(x * 100) / 100` -- test amounts like 0.1 + 0.2
- `getBalanceInfo(balance, type)` -- Label/color correctness for musteri, tedarikci, personel with positive/negative/zero balances

#### Property-based tests (fast-check)

- **Round-trip property:** `parseCurrency(formatCurrencyInput(x)) === x` within rounding for arbitrary positive numbers
- **Turkish/English format fuzzing:** Randomly insert thousands separators, spaces, currency signs, negative parentheses -- parser should either parse correctly or throw, never return wrong number silently
- **Conversion chain property:** TRY->USD->EUR: ensure rounding happens per-step consistently, never drifts more than 0.01 from expected

#### Rounding policy tests

- Explicitly document and test which rounding strategy is used (JS `Math.round` is "half away from zero" on .5 ties)
- Negative rounding: `-1.005` rounded to 2 decimals -- what does the app expect?
- Conversion chain rounding: rounding per-transaction vs per-report -- test that the chosen policy holds

### `src/lib/date.ts` (600 lines)

#### Example-based tests

- `getDateRange(period, offset)` -- Monthly/weekly/yearly boundaries, year wrapping, week Monday-start assumption
- `parseDateFromDB()` -- ISO strings, YYYY-MM-DD, null/undefined handling
- `formatDateForDB()` / `formatDateTimeForDB()` -- Timezone handling
- `formatRelativeDate()` -- "Bugun", "Dun", edge at midnight
- `addMonths()` / `addDays()` -- End-of-month overflow (Jan 31 + 1 month = ?), leap year handling
- `isSameDay()` / `isToday()` / `isDateInRange()` -- Boundary conditions
- `ensureValidDate()` -- Invalid input fallback behavior

#### Property-based tests (fast-check)

- **Range ordering:** For random dates and offsets, `startDate <= endDate` always
- **Contiguity:** Consecutive weekly/monthly ranges share a boundary (end of period N = start of period N+1)
- **No DST drift:** Same logical date formatted and parsed back equals original

#### Timezone/DST tests

- Turkey currently doesn't observe DST, but imported data and phone-generated timestamps may carry different offsets
- Test `formatDateTimeForDB()` is consistent about UTC vs local -- common silent bug class
- Test that DB timestamps (UTC) display correctly in Turkish local time

### `src/lib/validation.ts`

- `validAmount()` with edge inputs: "0", "-1", "abc", "", null, "1.234,56"
- `validPhone()` -- Turkish format edge cases (10-11 digits)
- `validEmail()` -- Standard RFC edge cases
- `validate()` and `validateFields()` -- Chaining behavior, first-error-wins semantics
- All preset validators (cariValidators, personelValidators, hesapValidators, kategoriValidators, islemValidators) -- Ensure they compose correctly

### `src/lib/supabaseErrors.ts`

- `SupabaseError` class -- Prototype chain correctness across JS engines (React Native Hermes)
- All 11+ error code detection functions (`isNoRowsError`, `isPermissionError`, `isForeignKeyError`, `isUniqueViolationError`, etc.)
- `getErrorMessage()` -- User-facing Turkish messages for every known error code, plus fallback for unknown codes
- `handleSingleResult()` -- Returns null for NO_ROWS, throws for other errors, handles case where both data and error are present
- Edge: malformed error objects (missing code, missing message, non-string code)

---

## Priority 2: Critical -- Transaction Balance Logic

**Depends on the `computeBalanceEffects()` extraction above.**

### Balance delta tests (pure function, no mocking)

- Each of the 13 transaction types produces specific balance deltas
- Test that `gelir` credits the account, `gider` debits it
- Test that `transfer` debits source and credits target
- Test `cari_odeme` with cross-currency (hesap=USD, cari=TRY) -- amount conversion correctness
- Test all `iade` (return) types reverse the direction of their base type

### Ledger invariant tests

These catch system-level failures that individual case tests miss:

- **Double-entry for transfers:** Net change across all accounts = 0 (no money created or destroyed)
- **Currency conservation:** If transaction is in currency A with rate to B, derived B amount matches rounding rules
- **No impossible states:** Credit card balance shouldn't exceed limit (if enforced), cash accounts shouldn't go below 0 (if enforced)
- **Rollback atomicity:** `computeBalanceEffects(tx)` and `computeBalanceEffects(reverseTx)` should sum to zero for every type

### Rollback path tests

- If balance update fails, the created transaction must be deleted
- Test the known risk: rollback errors are only logged in `__DEV__` mode -- fix this

### UI double-submission guard

- The real idempotency risk is double-submission from the UI (button tapped twice), not duplicate balance application
- Test that mutation calls disable the submit button / are debounced

---

## Priority 3: Critical -- Auth Lifecycle

`src/hooks/useAuth.ts` (776 lines) manages the entire auth state with race condition prevention and multi-step initialization. Auth failures silently break the entire app.

### Race condition prevention

- `fetchOrCreateIsletme` uses a lock pattern with `createIsletmeLock.current` and a `pendingRequests` Map
- Test that 3+ concurrent calls to `fetchOrCreateIsletme` result in exactly 1 DB call and all callers receive the same result
- Test that the `pendingRequests` Map doesn't grow unbounded after resolution

### Token refresh

- Refresh triggers: app foreground (>1 min since last), periodic (every 2 min), auth state change
- Test that a token expiring within 300 seconds triggers refresh
- Test that refresh failure doesn't crash the app or log the user out silently
- Test the `mounted` flag doesn't become stale due to closure capture

### Session restoration

- Test app cold start with valid session -> user is logged in
- Test app cold start with expired session -> refresh attempted -> success/failure paths
- Test app cold start with no session -> anonymous state

### Platform-specific auth

- Apple Sign-In flow: nonce generation, credential validation
- Google Sign-In flow: idToken extraction, Supabase handoff
- Test that auth errors from providers are surfaced to the user, not swallowed

### Account deletion scheduling

- 7-day grace period: test that `scheduled_deletion_at` is set correctly
- Test cancellation within grace period
- Test that deletion warning displays correct days remaining

---

## Priority 4: High -- Excel Import Parser

`src/lib/excelImport.ts` at ~1590 lines is the single largest file and contains dense logic.

### Golden file fixture tests

Instead of only unit assertions, maintain a handful of representative input files:

- A typical Turkish bank export (TR locale, DD.MM.YYYY dates, Turkish number format)
- An English-format export (EN locale, MM/DD/YYYY, English number format)
- A mixed-format file with edge cases (missing columns, extra whitespace, diacritics)
- Assert the normalized `ParsedTransaction[]` output exactly against a snapshot

### Header detection

- Turkish character normalization (I->I, S->S, G->G)
- Column matching with partial/fuzzy names
- **Fuzz tests:** Random casing, diacritics, punctuation, extra whitespace, "TL" vs "₺"

### Date parsing

- Excel serial number conversion (`excelDateToJS`)
- String formats: YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY with optional time
- Invalid date fallback behavior

### Transaction type mapping (50+ mappings)

- Context-aware correction: "GIDER" + TEDARIKCI column = `cari_alis`
- Priority ordering: TRANSFER > entity columns > default
- Test the full mapping table exhaustively

### Amount parsing

- Floating-point precision (round to 2 decimals)
- Signed amounts for opening balance detection
- Turkish vs English number formats in import
- **Fuzz:** Random combinations of thousands separators, decimal separators, currency symbols

### `autoClassifyAccounts()`

- Bank name keyword detection (Ziraat, Garanti, etc.)
- Account type inference from name

### `validateImportData()`

- Quality score calculation (0-100)
- Error categorization (date_invalid, amount_invalid, entity_not_found, type_unknown, duplicate, starting_balance)

### `calculateFileHash()`

- SHA-256 path when `crypto.subtle` is available
- Fallback simple hash path when `crypto.subtle` is unavailable
- Test both paths produce consistent results for same input
- Test collision resistance of fallback hash

---

## Priority 5: High -- Import Orchestration

`src/hooks/useDataImport.ts` (~2000 lines) orchestrates the entire batch import pipeline. This is distinct from the parser (Priority 4) -- this is the stateful orchestration layer.

### Entity creation pipeline

- Categories, accounts, clients, personnel created in correct dependency order
- Entity ID mapping: parsed names -> created UUIDs used in subsequent transaction inserts
- Category reactivation: inactive categories matched by name are set back to active
- Entity lookup uses case-insensitive name matching -- test that "Nakit" matches "nakit"

### Batch transaction insertion

- Chunk size (100/500) boundaries -- test that chunk N's last item and chunk N+1's first item are both inserted
- Duplicate detection using `date|amount` key -- test that legitimate same-day same-amount transactions aren't wrongly skipped
- Transfer transactions require both `hesap_id` and `hedef_hesap_id` -- test that missing target account fails gracefully

### Starting balance extraction and application

- Starting balances update existing entity balances directly (not via transaction)
- Balance recalculation subtracts existing transaction effects -- test correctness with mixed transaction types
- Test that starting balance for a new entity vs existing entity with transactions produces correct results

### Balance update aggregation

- Aggregate all balance deltas per entity, then call `increment_balance` RPC once per entity
- Test that 50 transactions affecting the same account produce a single correct aggregate delta
- Test NaN/Infinity handling in amount rounding

### Undo capability

- Undo deletes all created transactions and entities, reverses all balance changes
- Test that undo after partial import (some chunks succeeded, some failed) cleans up correctly
- Test that undo doesn't delete transactions created by the user after the import

---

## Priority 6: High -- Reporting Aggregation Logic

### `useCashFlowByCategory.ts` (417 lines)

- Cash account type separation (nakit, banka, birikim, diger) vs credit card
- Transfer handling: `nakit->credit_card` = outflow, `nakit->nakit` = zero net
- "Top N + Other" grouping correctness
- NaN-safe parsing: invalid amounts silently become 0 (test this behavior)

### `useCategoryReport.ts` (775 lines)

- Parent-child category aggregation
- Orphan category handling (child with missing parent)
- Hierarchical tree construction from flat data

---

## Priority 7: High -- Cheque & Scheduled Transaction Lifecycle

### `src/hooks/useCekler.ts` -- Cheque management

- Payment flow: creates `cari_odeme` transaction + updates hesap and cari balances
- Complex rollback with `hesapBalanceUpdated` flag tracking partial state
- Test: first balance update succeeds, second fails -> rollback must reverse the first
- Test: transaction creation fails after both balance updates -> both reversed
- State guards: only `beklemede` cheques can be paid or cancelled
- Reminder scheduling for due dates -- test that past-due dates don't schedule notifications

### `src/hooks/useIleriTarihliIslemler.ts` -- Scheduled transactions

- Completion flow: creates actual transaction + updates balances + marks complete
- `updateBalancesForIslem` handles 7 transaction types with specific balance logic
- `reverseBalancesForIslem` must be exact inverse of `updateBalancesForIslem` for every type
- Test: balance update failure between transaction creation and status update -> must clean up
- Test: scheduled date in the past -> should still be completable

### `src/hooks/useNakitAvans.ts` -- Cash advance lifecycle

- RPC-based atomic operations: `perform_nakit_avans`, `perform_taksit_odeme`, `delete_nakit_avans_with_reversal`
- Installment payment marks taksit as paid + updates source hesap + updates credit card
- If all installments paid, nakit_avans status auto-completes
- Test: concurrent installment payments on same avans
- Test: deletion with partially paid installments reverses all paid amounts correctly

---

## Priority 8: High -- Import History & Undo

`src/hooks/useImportHistory.ts` -- AsyncStorage-based import tracking with full rollback.

### File hash deduplication

- Test that re-importing the same file is blocked
- Test that modified file (same name, different content) is allowed

### Undo logic

- Undo finds ALL transactions related to imported entities -- test that it doesn't catch unrelated transactions that happen to share a FK
- Balance reversal uses `increment_balance` RPC with negative amounts -- test sign correctness for all 12+ transaction types
- Batch deletion in 100-item chunks -- test boundary conditions

### History management

- Max 10 items per isletme -- test rotation when limit reached
- JSON parse failures return null silently -- test corrupted AsyncStorage data recovery
- Multiple isletmes share the same AsyncStorage key (filtered by isletmeId) -- test isolation

---

## Priority 9: Medium -- Component Data Transformations

Several components contain business logic that should be extracted and tested:

| Component | Logic to Extract & Test |
|-----------|------------------------|
| `SummaryCarousel.tsx` | Net profit, percentage calculations, division-by-zero when no income/expense |
| `PendingTransactionForm.tsx` | Opening balance recalculation, category type determination, entity search/filter logic |
| `NakitAvansSheet.tsx` | Installment amount calculations (`Math.ceil`), remainder handling, installment date generation |
| `index.tsx` (Home) | Account grouping by type, category totals with currency filtering, deletion days remaining calculation |
| `QuickTransactionBar.tsx` | `getCategoryType()` mapping, conditional field visibility logic for 16+ transaction types |

---

## Priority 10: Medium -- Analytics Engine

### `src/hooks/useAnalyticsTrend.ts`

- 6-period trend calculation (weekly/monthly/yearly) with period label generation
- Transaction grouping by period boundaries
- Test: week boundary alignment (Monday-based) with cross-month weeks
- Test: year-end boundary (period spanning Dec-Jan)

### `src/hooks/useAnalyticsInsights.ts`

- 5 insight types: receivables warning, payables warning, collection trend, credit card debt, net profit
- Percentage change calculation -- test division by zero when previous period income = 0
- Priority-based sorting (hardcoded values 20-95)
- Test: all insights generated when financial data supports them
- Test: no insights when data is clean

### `src/hooks/useAnalyticsSummary.ts`

- KPI aggregation with delta calculations (current vs previous period)
- Sparkline data for last 6 periods
- Test: delta calculation when previous period has zero values
- Test: passive account filtering excludes inactive accounts from counts

### `src/hooks/useFinancialSummary.ts`

- Multi-entity balance aggregation across hesaplar, cariler, personel
- Currency conversion to base currency using exchange rates
- Test: `convertCurrency` returns null when rate missing -- verify fallback to original amount
- Test: balance direction interpretation (positive/negative meaning varies by entity type)
- Test: birikim (savings) type special handling

---

## Priority 11: Medium -- Exchange Rates & Settings

### `src/hooks/useExchangeRates.ts`

- Three conversion functions: `convertToTRY`, `convertFromTRY`, `convertCurrency` (via TRY intermediary)
- Test: TRY-to-TRY self-conversion returns amount unchanged
- Test: missing rate returns null (not 0, not NaN)
- Test: division by zero in `convertFromTRY` (rate validation should prevent this)
- Test: floating-point precision with large amounts (1M+ TRY)
- Test: rate cache staleness (1 hour staleTime)

### `src/hooks/useSettings.ts`

- Global state management with listener pattern for cross-instance synchronization
- Test: changing currency in one component propagates to all listeners
- Test: AsyncStorage persistence survives app restart
- Test: locale detection fallback (unknown country -> TRY default)
- Test: concurrent initialization from multiple components
- Test: Eurozone country-to-currency mapping (DE -> EUR, FR -> EUR, etc.)

---

## Priority 12: Medium -- Notification Scheduling

`src/lib/notifications.ts` -- Push notification scheduling for reminders.

- Reminder date calculation: trigger date = transaction date - N days, at specified time
- Test: reminder for transaction 3 days from now with "2 days before" setting -> schedules for tomorrow
- Test: reminder in the past is rejected (not scheduled)
- Test: boundary condition -- reminder exactly at current moment
- Test: cancellation removes the correct notification ID from AsyncStorage
- Test: multiple reminders for same transaction (cancel before reschedule)
- Test: Android channel creation is idempotent

---

## Priority 13: Medium -- Image Processing & Review Eligibility

### `src/lib/imageUtils.ts`

- Recursive compression: reduces width by 20% and quality by 15% each iteration
- Termination conditions: minimum 640px width AND 0.3 quality
- Test: image already under 200KB is not recompressed
- Test: recursion terminates within reasonable depth (no infinite loop)
- Test: very large image (10MB+) eventually reaches termination conditions
- Test: `getInfoAsync` returning missing `size` field

### `src/lib/reviewStorage.ts`

- 5 eligibility conditions: 7+ days since first launch, 10+ transactions, <2 lifetime prompts, 180+ days since last prompt
- Test: each condition independently (boundary values: exactly 7 days, exactly 10 transactions, etc.)
- Test: all conditions met -> eligible
- Test: one condition fails -> not eligible
- Test: corrupted JSON in AsyncStorage -> graceful fallback (not eligible)
- Test: empty promptHistory array handling

---

## Priority 14: Medium -- Query Cache Invalidation

### `src/lib/queryKeys.ts` (460 lines)

- Test that `invalidateRelatedQueries('islem')` invalidates all expected keys (islemler, hesaplar, cariler, personel, month-summary, category-report, cash-flow)
- Test the two-tier strategy: immediate queries use `refetchType: 'active'`, deferred use `refetchType: 'none'`
- Regression prevention: adding a new entity type without updating the invalidation map

### Future-proof guard test

```typescript
// Every entity in the EntityName union must have an invalidation config.
// This test fails loudly when someone adds a new entity without mapping it.
test('all entity types have invalidation config', () => {
  const allEntities: EntityName[] = ['islem', 'hesap', 'cari', 'personel', 'kategori', ...];
  for (const entity of allEntities) {
    expect(invalidationMap[entity]).toBeDefined();
  }
});
```

---

## Priority 15: High -- Contract Tests -- Supabase + DB Constraints

Mocks are fine for unit tests, but for a money app, a small layer of tests must validate real DB behavior.

### RPC functions to test against local Supabase

| Function | Critical Test Cases |
|----------|-------------------|
| `perform_nakit_avans()` | Cross-isletme account validation rejected, concurrent calls on same credit card, amount > 0 enforced |
| `perform_taksit_odeme()` | Double payment prevented (FOR UPDATE lock), status transition `pending -> paid`, final taksit auto-completes avans |
| `delete_nakit_avans_with_reversal()` | All paid installments reversed, islemler deletion scoped correctly (not deleting unrelated same-day transactions), orphaned records check |
| `increment_balance()` | **Security:** table name injection blocked, non-existent table/ID handling, negative amounts allowed (intentional) |
| `update_urun_miktar()` | Stock going negative allowed/blocked (clarify policy), decimal precision with NUMERIC(15,3), non-existent product ID |
| `get_income_expense_summary()` | Inactive account exclusion, NULL hesap_id handling, date boundary precision (DATE vs TIMESTAMPTZ), empty result returns NULL not 0 |
| `get_category_report()` | Empty types array, NULL kategori_id grouping, COUNT/SUM on NULL amounts |

### RLS policy tests

- Tenant isolation: user A cannot read/write user B's data for every table
- NULL `auth.uid()` handling -- should block all access
- User with no isletme -- should return empty, not error
- Nested policies (nakit_avans_taksitler -> nakit_avanslar -> isletmeler) -- cross-tenant access blocked at every level

### Trigger tests

- `update_updated_at` fires on UPDATE for all 7 tables
- `create_default_kategoriler` creates exactly 9 categories (3 gelir + 6 gider) on isletme creation
- Default categories have correct types, icons, and colors
- Explicit `updated_at` value is overridden by trigger (confirm this is intentional)

### CHECK constraint tests

- `islemler.type` -- all 13 allowed values accepted, unknown values rejected
- `islemler.amount > 0` -- zero and negative rejected
- `hesaplar.type` -- all 5 values accepted (nakit, banka, kredi_karti, birikim, diger)
- `kategoriler.type` -- gelir and gider accepted, other values rejected
- `urun_hareketler.hareket_tipi` -- giris, cikis, duzeltme accepted
- `nakit_avanslar.status` -- active, completed, cancelled accepted
- `nakit_avans_taksitler.status` -- pending, paid, overdue accepted

### Schema consistency tests

- Verify that columns referenced in `delete_nakit_avans_with_reversal` (`source_hesap_id` on taksitler, `odendi` flag) actually exist -- potential schema mismatch between migration versions
- Verify that all foreign keys referenced in hooks exist as actual DB constraints

---

## Phase 2: E2E Smoke Suite

Not full UI testing, just sanity. Keep this lightweight -- 5 tests max.

1. Create income -> account balance increases
2. Create transfer -> source decreases + target increases
3. Import a small Excel -> correct number of rows created and totals match
4. Create cheque -> mark as paid -> balances update correctly
5. Sign in -> isletme created/fetched -> data loads

For Expo/React Native, Detox is the standard tool. If too heavy for now, defer to Phase 2 but keep the slot planned.

---

## Recommended Test Infrastructure Setup

```
Framework:    Jest + @testing-library/react-native
              (Jest already exists as transitive dependency via Expo)
Property:     fast-check (for currency/date/import fuzzing)
Contract:     Supabase CLI (local instance for DB tests)
E2E (Phase2): Detox

Structure:
  src/lib/__tests__/              -- Pure function unit tests
  src/lib/__tests__/fixtures/     -- Golden file XLSX/CSV inputs for import tests
  src/lib/balanceEffects.ts       -- Extracted from useIslemler (pre-requisite refactor)
  src/lib/__tests__/balanceEffects.test.ts
  src/hooks/__tests__/            -- Hook tests with renderHook
  src/components/__tests__/       -- Component interaction tests
  supabase/__tests__/             -- Contract tests against local Supabase
  e2e/                            -- Detox smoke tests (Phase 2)
```

### Execution order

| # | Test File | Est. Cases | Dependencies |
|---|-----------|------------|--------------|
| 0 | **Extract `computeBalanceEffects()`** | refactor | None |
| 1 | `currency.test.ts` | ~60 | None (pure functions) |
| 2 | `date.test.ts` | ~50 | None (pure functions) |
| 3 | `validation.test.ts` | ~30 | None (pure functions) |
| 4 | `supabaseErrors.test.ts` | ~20 | None (pure functions) |
| 5 | `balanceEffects.test.ts` | ~50 | None (pure function after extraction) |
| 6 | `excelImport.test.ts` | ~70 | Golden file fixtures |
| 7 | `useAuth.test.ts` | ~30 | Supabase mock, AsyncStorage mock |
| 8 | `useDataImport.test.ts` | ~40 | Supabase mock |
| 9 | `useImportHistory.test.ts` | ~20 | AsyncStorage mock |
| 10 | `useCekler.test.ts` | ~25 | Supabase mock |
| 11 | `useIleriTarihli.test.ts` | ~20 | Supabase mock |
| 12 | `useNakitAvans.test.ts` | ~20 | Supabase mock |
| 13 | `cashFlow.test.ts` | ~25 | Supabase mock |
| 14 | `categoryReport.test.ts` | ~20 | Supabase mock |
| 15 | `useFinancialSummary.test.ts` | ~15 | Supabase mock |
| 16 | `analytics.test.ts` | ~25 | Supabase mock |
| 17 | `useExchangeRates.test.ts` | ~15 | Supabase mock |
| 18 | `useSettings.test.ts` | ~15 | AsyncStorage mock |
| 19 | `notifications.test.ts` | ~15 | Expo Notifications mock |
| 20 | `imageUtils.test.ts` | ~10 | Expo ImageManipulator mock |
| 21 | `reviewStorage.test.ts` | ~10 | AsyncStorage mock |
| 22 | `queryKeys.test.ts` | ~15 | None |
| 23 | `contract.test.ts` | ~25 | Local Supabase |
| 24 | E2E smoke suite | ~5 | Detox (Phase 2) |

**Total estimated test cases: ~665**

---

## Known Bugs to Write Tests Against

1. **Silent balance corruption** -- Rollback failures only logged in `__DEV__`. Write a test proving the failure path, then fix the error handling.
2. **NaN -> 0 conversion** in `useCashFlowByCategory.ts` -- Invalid transaction amounts silently become 0, skewing reports.
3. **Week calculation assumes Monday start** -- `dayOfWeek === 0 ? -6 : 1 - dayOfWeek` breaks for Sunday-first locales. Write a parametric test.
4. **File hash fallback** -- When `crypto.subtle` is unavailable, the hash falls back to a timestamp-based value with collision risk. Test both paths.
5. **Exchange rate = 0** -- `calculateTargetAmount()` with rate=0 returns the original amount with only a `__DEV__` warning.
6. **Negative rounding** -- `-1.005` rounded to 2 decimals behaves differently than expected in JS. Document and test the chosen policy.
7. **Conversion chain drift** -- TRY->USD->EUR with per-step rounding may accumulate error. Test that it stays within acceptable bounds.
8. **`delete_nakit_avans_with_reversal` schema mismatch** -- References `source_hesap_id` on taksitler and `odendi` flag that may not match actual schema columns. Verify and test.
9. **`increment_balance` SQL injection surface** -- Uses `format()` with dynamic table name. Test that only allowed table names are accepted.
10. **Cheque rollback partial state** -- `hesapBalanceUpdated` flag tracks partial updates, but if the flag itself is wrong, rollback skips or double-reverses. Write a test for each partial failure combination.
11. **Import undo over-deletion** -- Undo finds transactions by FK to imported entities, but could catch user-created transactions that reference the same entities. Test this boundary.
12. **Auth race condition** -- `pendingRequests` Map could grow unbounded if promises never resolve. Test timeout behavior.
13. **Settings listener leak** -- Listener Set cleanup in `useEffect` return might race with new subscriptions. Test rapid mount/unmount cycles.
14. **Notification past-date scheduling** -- Uses `<=` instead of `<` for past date rejection. Boundary condition: reminder at exact current second.
