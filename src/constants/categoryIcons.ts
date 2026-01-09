/**
 * Category Icons
 *
 * Icons available for users when creating categories.
 * Uses Lucide icon names.
 */

export interface CategoryIconOption {
  name: string; // Lucide icon name (saved to database)
  label: string; // Display label for user
  group: 'general' | 'finance' | 'transport' | 'food' | 'shopping' | 'technology' | 'bills' | 'staff' | 'other';
}

/**
 * Available icons for categories (alphabetical order)
 */
export const CATEGORY_ICONS: CategoryIconOption[] = [
  { name: 'megaphone', label: 'Advertising', group: 'other' },
  { name: 'plane', label: 'Airplane', group: 'transport' },
  { name: 'archive', label: 'Archive', group: 'general' },
  { name: 'landmark', label: 'Bank', group: 'finance' },
  { name: 'banknote', label: 'Banknote', group: 'finance' },
  { name: 'wine', label: 'Bar', group: 'food' },
  { name: 'barcode', label: 'Barcode', group: 'shopping' },
  { name: 'bookmark', label: 'Bookmark', group: 'general' },
  { name: 'award', label: 'Bonus', group: 'staff' },
  { name: 'box', label: 'Box', group: 'shopping' },
  { name: 'egg', label: 'Breakfast', group: 'food' },
  { name: 'briefcase', label: 'Briefcase', group: 'general' },
  { name: 'building', label: 'Building', group: 'other' },
  { name: 'bus', label: 'Bus', group: 'transport' },
  { name: 'calculator', label: 'Calculator', group: 'finance' },
  { name: 'camera', label: 'Camera', group: 'technology' },
  { name: 'car', label: 'Car', group: 'transport' },
  { name: 'spray-can', label: 'Cleaning', group: 'other' },
  { name: 'coffee', label: 'Coffee', group: 'food' },
  { name: 'coins', label: 'Coins', group: 'finance' },
  { name: 'scale', label: 'Commission', group: 'other' },
  { name: 'compass', label: 'Compass', group: 'transport' },
  { name: 'clipboard', label: 'Consulting', group: 'other' },
  { name: 'contact', label: 'Customer', group: 'shopping' },
  { name: 'milk', label: 'Dairy', group: 'food' },
  { name: 'circle-alert', label: 'Debt', group: 'finance' },
  { name: 'trending-down', label: 'Decrease', group: 'finance' },
  { name: 'hand-helping', label: 'Deposit', group: 'other' },
  { name: 'file-signature', label: 'Documents', group: 'other' },
  { name: 'zap', label: 'Electricity', group: 'bills' },
  { name: 'user-check', label: 'Employee', group: 'staff' },
  { name: 'cog', label: 'Equipment', group: 'technology' },
  { name: 'globe', label: 'Export', group: 'other' },
  { name: 'file-check', label: 'Fees', group: 'bills' },
  { name: 'flag', label: 'Flag', group: 'general' },
  { name: 'folder', label: 'Folder', group: 'general' },
  { name: 'circle-dollar-sign', label: 'Foreign Currency', group: 'finance' },
  { name: 'apple', label: 'Fruit', group: 'food' },
  { name: 'flame', label: 'Gas', group: 'bills' },
  { name: 'gift', label: 'Gift', group: 'general' },
  { name: 'salad', label: 'Groceries', group: 'food' },
  { name: 'users-round', label: 'Group', group: 'staff' },
  { name: 'hammer', label: 'Hammer', group: 'other' },
  { name: 'hard-drive', label: 'Hard Drive', group: 'technology' },
  { name: 'headphones', label: 'Headphones', group: 'technology' },
  { name: 'heart', label: 'Heart', group: 'general' },
  { name: 'bed', label: 'Hotel', group: 'transport' },
  { name: 'ice-cream-cone', label: 'Ice Cream', group: 'food' },
  { name: 'trending-up', label: 'Increase', group: 'finance' },
  { name: 'badge', label: 'Insurance', group: 'staff' },
  { name: 'wifi', label: 'Internet', group: 'bills' },
  { name: 'chart-line', label: 'Investment', group: 'other' },
  { name: 'file-text', label: 'Invoice', group: 'bills' },
  { name: 'chef-hat', label: 'Kitchen', group: 'food' },
  { name: 'laptop', label: 'Laptop', group: 'technology' },
  { name: 'layers', label: 'Layers', group: 'general' },
  { name: 'map-pin', label: 'Location', group: 'transport' },
  { name: 'construction', label: 'Maintenance', group: 'other' },
  { name: 'shopping-basket', label: 'Market', group: 'food' },
  { name: 'beef', label: 'Meat', group: 'food' },
  { name: 'circle-help', label: 'Miscellaneous', group: 'other' },
  { name: 'dollar-sign', label: 'Money', group: 'finance' },
  { name: 'monitor', label: 'Monitor', group: 'technology' },
  { name: 'navigation', label: 'Navigation', group: 'transport' },
  { name: 'building-2', label: 'Office', group: 'other' },
  { name: 'circle-minus', label: 'Other Expense', group: 'other' },
  { name: 'circle-plus', label: 'Other Income', group: 'other' },
  { name: 'clock', label: 'Overtime', group: 'staff' },
  { name: 'package', label: 'Package', group: 'shopping' },
  { name: 'paintbrush', label: 'Paint', group: 'other' },
  { name: 'cake', label: 'Pastry', group: 'food' },
  { name: 'calendar', label: 'Payday', group: 'staff' },
  { name: 'user', label: 'Person', group: 'staff' },
  { name: 'phone', label: 'Phone Bill', group: 'bills' },
  { name: 'pizza', label: 'Pizza', group: 'food' },
  { name: 'presentation', label: 'Presentation', group: 'other' },
  { name: 'printer', label: 'Printer', group: 'technology' },
  { name: 'chart-pie', label: 'Profit Share', group: 'finance' },
  { name: 'receipt', label: 'Receipt', group: 'finance' },
  { name: 'home', label: 'Rent', group: 'bills' },
  { name: 'chart-bar', label: 'Report', group: 'other' },
  { name: 'utensils', label: 'Restaurant', group: 'food' },
  { name: 'scissors', label: 'Scissors', group: 'other' },
  { name: 'settings', label: 'Settings', group: 'other' },
  { name: 'ship', label: 'Ship', group: 'transport' },
  { name: 'shopping-cart', label: 'Shopping Cart', group: 'shopping' },
  { name: 'smartphone', label: 'Smartphone', group: 'technology' },
  { name: 'wheat', label: 'Staples', group: 'food' },
  { name: 'star', label: 'Star', group: 'general' },
  { name: 'store', label: 'Store', group: 'shopping' },
  { name: 'handshake', label: 'Supplier', group: 'shopping' },
  { name: 'ribbon', label: 'Supplies', group: 'other' },
  { name: 'sparkles', label: 'Decorations', group: 'other' },
  { name: 'tag', label: 'Tag', group: 'general' },
  { name: 'target', label: 'Target', group: 'other' },
  { name: 'scroll-text', label: 'Tax', group: 'bills' },
  { name: 'users', label: 'Team', group: 'staff' },
  { name: 'hand-coins', label: 'Tips', group: 'finance' },
  { name: 'train-front', label: 'Train', group: 'transport' },
  { name: 'luggage', label: 'Travel', group: 'transport' },
  { name: 'truck', label: 'Truck/Cargo', group: 'transport' },
  { name: 'percent', label: 'Turnover', group: 'finance' },
  { name: 'tv', label: 'TV', group: 'technology' },
  { name: 'wallet', label: 'Wallet', group: 'finance' },
  { name: 'droplet', label: 'Water', group: 'bills' },
  { name: 'croissant', label: 'Bakery', group: 'food' },
  { name: 'credit-card', label: 'Credit Card', group: 'finance' },
  { name: 'piggy-bank', label: 'Savings', group: 'finance' },
  { name: 'wrench', label: 'Repair', group: 'other' },
];

/**
 * Default category colors
 */
export const CATEGORY_COLORS = [
  { value: '#10B981', label: 'Green' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#F59E0B', label: 'Orange' },
  { value: '#EF4444', label: 'Red' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#6366F1', label: 'Indigo' },
  { value: '#14B8A6', label: 'Teal' },
  { value: '#F97316', label: 'Dark Orange' },
];

/**
 * Default icon (if no icon selected)
 */
export const DEFAULT_CATEGORY_ICON = 'tag';

/**
 * Default color (if no color selected)
 */
export const DEFAULT_CATEGORY_COLOR = '#6366F1';
