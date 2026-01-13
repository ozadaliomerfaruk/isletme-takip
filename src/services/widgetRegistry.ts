import type { AnalyticsWidget, UserRole } from '@/types/analytics';

interface GetWidgetsOptions {
  role?: UserRole;
  activeModules?: string[];
  hiddenWidgets?: string[];
}

/**
 * Widget Registry - Central registry for all analytics widgets
 *
 * Usage:
 * - Modules register their widgets at app startup
 * - Analytics page queries registry for visible widgets
 * - Future modules can add widgets without modifying analytics page
 */
class WidgetRegistry {
  private widgets: Map<string, AnalyticsWidget> = new Map();

  /**
   * Register a widget to the registry
   */
  register(widget: AnalyticsWidget): void {
    if (this.widgets.has(widget.id)) {
      console.warn(`Widget "${widget.id}" is already registered. Overwriting.`);
    }
    this.widgets.set(widget.id, widget);
  }

  /**
   * Register multiple widgets at once
   */
  registerMany(widgets: AnalyticsWidget[]): void {
    widgets.forEach(widget => this.register(widget));
  }

  /**
   * Unregister a widget from the registry
   */
  unregister(widgetId: string): void {
    this.widgets.delete(widgetId);
  }

  /**
   * Unregister all widgets from a specific module
   */
  unregisterModule(moduleId: string): void {
    for (const [id, widget] of this.widgets.entries()) {
      if (widget.moduleId === moduleId) {
        this.widgets.delete(id);
      }
    }
  }

  /**
   * Get a specific widget by ID
   */
  getWidget(widgetId: string): AnalyticsWidget | undefined {
    return this.widgets.get(widgetId);
  }

  /**
   * Get all visible widgets based on role, active modules, and user preferences
   */
  getWidgets(options: GetWidgetsOptions = {}): AnalyticsWidget[] {
    return Array.from(this.widgets.values())
      .filter(widget => this.isWidgetVisible(widget, options))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get widgets for a specific module
   */
  getWidgetsByModule(moduleId: string): AnalyticsWidget[] {
    return Array.from(this.widgets.values())
      .filter(widget => widget.moduleId === moduleId)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if a widget is visible based on options
   */
  private isWidgetVisible(widget: AnalyticsWidget, options: GetWidgetsOptions): boolean {
    const { role, activeModules, hiddenWidgets } = options;

    // Role check: If widget has roles defined and user role doesn't match
    if (widget.roles.length > 0 && role && !widget.roles.includes(role)) {
      return false;
    }

    // Module check: If widget requires modules and they're not active
    if (widget.requiresModule?.length && activeModules) {
      const hasAllModules = widget.requiresModule.every(m => activeModules.includes(m));
      if (!hasAllModules) {
        return false;
      }
    }

    // User preference: If user has hidden this widget
    if (hiddenWidgets?.includes(widget.id)) {
      return false;
    }

    return true;
  }

  /**
   * Get all registered widget IDs
   */
  getRegisteredIds(): string[] {
    return Array.from(this.widgets.keys());
  }

  /**
   * Get all registered modules
   */
  getRegisteredModules(): string[] {
    const modules = new Set<string>();
    for (const widget of this.widgets.values()) {
      modules.add(widget.moduleId);
    }
    return Array.from(modules);
  }

  /**
   * Clear all widgets (useful for testing)
   */
  clear(): void {
    this.widgets.clear();
  }

  /**
   * Get widget count
   */
  get count(): number {
    return this.widgets.size;
  }
}

// Singleton instance
export const widgetRegistry = new WidgetRegistry();

// Export class for testing
export { WidgetRegistry };
