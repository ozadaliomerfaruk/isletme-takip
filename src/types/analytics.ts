import React from 'react';

// ============================================
// Widget System Types
// ============================================

export type WidgetSize = 'half' | 'full';
export type WidgetType = 'kpi' | 'chart' | 'list' | 'insight' | 'custom';
export type UserRole = 'owner' | 'cashier' | 'purchaser' | 'accountant';
export type AnalyticsPeriod = 'weekly' | 'monthly' | 'yearly';

/**
 * Props passed to every widget component
 */
export interface WidgetProps {
  period: AnalyticsPeriod;
  dateRange: DateRange;
  previousDateRange: DateRange;
  onNavigate: (route: string, params?: Record<string, string>) => void;
}

/**
 * Widget definition for registry
 */
export interface AnalyticsWidget {
  // Identity
  id: string;
  moduleId: string; // 'finance' | 'stock' | 'staff' | 'reservation' | etc.

  // Display
  title: string;
  titleKey: string; // i18n key
  icon?: string; // Lucide icon name

  // Layout
  size: WidgetSize;
  priority: number; // Lower = higher (10, 20, 30...)

  // Access Control
  roles: UserRole[]; // Empty = everyone can see
  requiresModule?: string[]; // Required modules to be active

  // Render
  component: React.ComponentType<WidgetProps>;
}

// ============================================
// Date & Period Types
// ============================================

export interface DateRange {
  startDate: string;
  endDate: string;
}

// ============================================
// KPI & Metrics Types
// ============================================

export interface MetricWithDelta {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number;
  sparklineData: number[]; // Last 6 periods
}

export interface AnalyticsSummary {
  // Period metrics (with delta support)
  netProfit: MetricWithDelta;
  income: MetricWithDelta;
  expense: MetricWithDelta;

  // Instant metrics
  cashBalance: {
    total: number;
    accountCount: number;
  };
  receivables: {
    total: number;
    customerCount: number;
  };
  payables: {
    total: number;
    supplierCount: number;
    staffCount: number;
    creditCardDebt: number;
  };

  isLoading: boolean;
}

// ============================================
// Trend Chart Types
// ============================================

export interface TrendDataPoint {
  label: string; // "Jan", "Feb", etc. or localized
  income: number;
  expense: number;
  net: number;
  isCurrentPeriod: boolean;
}

export interface AnalyticsTrend {
  data: TrendDataPoint[];
  totals: {
    income: number;
    expense: number;
    net: number;
  };
  averages: {
    income: number;
    expense: number;
    net: number;
  };
  isLoading: boolean;
}

// ============================================
// Trend Filter Types
// ============================================

export type TrendFilterType = 'hesap' | 'cari' | 'kategori' | 'personel';

export interface TrendFilter {
  type: TrendFilterType;
  id: string;
  label: string;  // Display label for the selected entity
}

// ============================================
// Insight Types
// ============================================

export type InsightType = 'warning' | 'info' | 'success' | 'tip';

export interface Insight {
  id: string;
  type: InsightType;
  icon: string; // Lucide icon name
  title: string;
  subtitle?: string;
  priority: number; // 0-100
  action?: {
    label: string;
    route: string;
    params?: Record<string, string>;
  };
}

export interface AnalyticsInsights {
  insights: Insight[]; // Max 5, sorted by priority
  isLoading: boolean;
}

// ============================================
// Category Report Types
// ============================================

export interface CategoryDataPoint {
  id: string | null;
  name: string;
  amount: number;
  percentage: number;
  color: string;
  count: number;
}

// ============================================
// Cash Flow Types
// ============================================

export interface CashFlowSummary {
  inflow: number;
  outflow: number;
  net: number;
  netPercent: number;
  isPositive: boolean;
}

// ============================================
// Widget Preferences Types
// ============================================

export interface WidgetPreferences {
  hiddenWidgets: string[];
  widgetOrder?: string[]; // For future drag-drop support
}

// ============================================
// Context Types
// ============================================

export interface AnalyticsContextValue {
  // Period management
  period: AnalyticsPeriod;
  setPeriod: (p: AnalyticsPeriod) => void;
  periodOffset: number;
  setPeriodOffset: (offset: number | ((prev: number) => number)) => void;
  periodLabel: string;
  dateRange: DateRange;
  previousDateRange: DateRange;

  // User info
  userRole: UserRole;
  activeModules: string[];

  // Widget preferences
  hiddenWidgets: string[];
  toggleWidgetVisibility: (widgetId: string) => void;

  // Refresh
  refreshKey: number;
  refresh: () => void;

  // Navigation helper
  navigate: (route: string, params?: Record<string, string>) => void;
}
