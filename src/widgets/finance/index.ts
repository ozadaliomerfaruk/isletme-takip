/**
 * Finance Widgets Registration
 *
 * Registers all finance module widgets with the widget registry
 */

import { widgetRegistry } from '@/services/widgetRegistry';
import { FinanceKPIGrid } from './FinanceKPIGrid';
import { ReceivablesWidget } from './ReceivablesWidget';
import { PayablesWidget } from './PayablesWidget';
import { TrendChartWidget } from './TrendChartWidget';
import { CategoryDonutWidget } from './CategoryDonutWidget';
import { CashFlowWidget } from './CashFlowWidget';
import { InsightsWidget } from './InsightsWidget';

// Track if widgets are already registered to prevent duplicate registration warnings
let isRegistered = false;

/**
 * Register all finance widgets
 * Called during app initialization
 * Safe to call multiple times - will skip if already registered
 */
export function registerFinanceWidgets() {
  if (isRegistered) return;
  isRegistered = true;
  // KPI Grid - Priority 10 (top)
  widgetRegistry.register({
    id: 'finance-kpi-grid',
    moduleId: 'finance',
    title: 'Finansal Özet',
    titleKey: 'analytics:widgets.financeKpi',
    size: 'full',
    priority: 10,
    roles: [], // Everyone can see
    component: FinanceKPIGrid,
  });

  // Receivables Widget - Priority 20
  widgetRegistry.register({
    id: 'finance-receivables',
    moduleId: 'finance',
    title: 'Açık Alacak',
    titleKey: 'analytics:widgets.receivables',
    size: 'half',
    priority: 20,
    roles: ['owner', 'accountant'],
    component: ReceivablesWidget,
  });

  // Payables Widget - Priority 21
  widgetRegistry.register({
    id: 'finance-payables',
    moduleId: 'finance',
    title: 'Açık Borç',
    titleKey: 'analytics:widgets.payables',
    size: 'half',
    priority: 21,
    roles: ['owner', 'accountant'],
    component: PayablesWidget,
  });

  // Trend Chart Widget - Priority 30
  widgetRegistry.register({
    id: 'finance-trend',
    moduleId: 'finance',
    title: 'Gelir/Gider Trendi',
    titleKey: 'analytics:widgets.trend',
    size: 'full',
    priority: 30,
    roles: ['owner', 'accountant'],
    component: TrendChartWidget,
  });

  // Category Donut Widget - Priority 40
  widgetRegistry.register({
    id: 'finance-category',
    moduleId: 'finance',
    title: 'Kategori Dağılımı',
    titleKey: 'analytics:widgets.category',
    size: 'full',
    priority: 40,
    roles: ['owner'],
    component: CategoryDonutWidget,
  });

  // Cash Flow Widget - Priority 50
  widgetRegistry.register({
    id: 'finance-cashflow',
    moduleId: 'finance',
    title: 'Nakit Akışı',
    titleKey: 'analytics:widgets.cashFlow',
    size: 'full',
    priority: 50,
    roles: ['owner'],
    component: CashFlowWidget,
  });

  // Insights Widget - Priority 100 (bottom)
  widgetRegistry.register({
    id: 'finance-insights',
    moduleId: 'finance',
    title: 'İçgörüler',
    titleKey: 'analytics:widgets.insights',
    size: 'full',
    priority: 100,
    roles: [], // Everyone can see
    component: InsightsWidget,
  });
}

// Export individual widgets for direct import if needed
export { FinanceKPIGrid } from './FinanceKPIGrid';
export { ReceivablesWidget } from './ReceivablesWidget';
export { PayablesWidget } from './PayablesWidget';
export { TrendChartWidget } from './TrendChartWidget';
export { CategoryDonutWidget } from './CategoryDonutWidget';
export { CashFlowWidget } from './CashFlowWidget';
export { InsightsWidget } from './InsightsWidget';
