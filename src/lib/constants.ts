/** User roles (6 roles — decision) */
export const ROLES = ['pm', 'gm', 'manager', 'seller', 'driver', 'stock_keeper'] as const
export type Role = (typeof ROLES)[number]

/** Order statuses */
export const ORDER_STATUSES = ['محجوز', 'قيد_التحضير', 'جاهز', 'مؤكد', 'ملغي'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Payment statuses */
export const PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'cancelled'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Payment methods */
export const PAYMENT_METHODS = ['كاش', 'بنك', 'آجل'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Delivery statuses */
export const DELIVERY_STATUSES = ['قيد الانتظار', 'قيد_التحضير', 'جاهز', 'جاري التوصيل', 'تم التوصيل', 'ملغي'] as const

/** Driver task types */
export const TASK_TYPES = ['delivery', 'supplier_pickup', 'collection'] as const

/** Treasury account types */
export const TREASURY_TYPES = ['main_cash', 'main_bank', 'manager_box', 'driver_custody'] as const

/** Treasury movement categories */
export const TREASURY_CATEGORIES = [
  'sale_collection', 'supplier_payment', 'expense', 'settlement',
  'reward', 'profit_distribution', 'driver_handover', 'manager_settlement',
  'funding', 'bank_deposit', 'bank_withdrawal', 'refund', 'supplier_credit',
] as const

/** Expense categories */
export const EXPENSE_CATEGORIES = [
  'إيجار', 'رواتب', 'وقود', 'صيانة', 'اتصالات',
  'تسويق', 'تأمين', 'ضرائب', 'أخرى',
] as const

/** Product categories */
export const PRODUCT_CATEGORIES = [
  'دراجات كهربائية', 'سكوترات', 'إكسسوارات',
  'قطع غيار', 'بطاريات', 'شواحن', 'أخرى',
] as const

/** Categories that require VIN (decision L1) */
export const VIN_REQUIRED_CATEGORIES = ['دراجات كهربائية', 'سكوترات'] as const

/** Discount types */
export const DISCOUNT_TYPES = ['percent', 'fixed'] as const

/** Default landing page per role */
export const DEFAULT_PAGES: Record<Role, string> = {
  pm: '/dashboard',
  gm: '/dashboard',
  manager: '/dashboard',
  seller: '/orders',
  driver: '/driver-tasks',
  stock_keeper: '/preparation',
}
