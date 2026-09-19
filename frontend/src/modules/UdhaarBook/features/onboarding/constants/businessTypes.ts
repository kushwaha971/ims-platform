import {
  Briefcase,
  Factory,
  Grid2x2,
  Scale,
  Store,
  Truck,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { ModuleCode } from 'src/types/domain.types';

/**
 * PLT-03 FR-7 — the nine business types and, for the summary card only, the
 * client's copy of what each one turns on.
 *
 * **The server is authoritative** (FR-5: `services.onboarding.apply_preset`).
 * This table exists so step 4 can show the merchant what is about to happen
 * before they press the button — not so the client can apply anything. If the
 * two ever disagree, the server wins and the summary is the thing that is
 * wrong, which is why every field here is display data and none of it is sent.
 *
 * Canon §0.2 / FR-8: a business type NEVER hard-wires behaviour. Everything
 * below is a default that PLT-06 and PLT-07 can change afterwards, and changing
 * the type later does not re-apply any of it.
 */
export const BUSINESS_TYPES = [
  'retail',
  'wholesale',
  'distribution',
  'services',
  'trader',
  'manufacturer',
  'professional',
  'food',
  'other',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface BusinessTypeConfig {
  readonly value: BusinessType;
  readonly icon: LucideIcon;
  /** i18n key — never a literal (§19.11.3). */
  readonly labelId: string;
  /** §8 — "tiles show a one-line hint of what they turn on". */
  readonly hintId: string;
  readonly inventoryEnabled: boolean;
  /** FR-7's default due days: 7, 15 or 30. */
  readonly defaultDueDays: number;
  /** UQC codes, shown verbatim; they are statutory codes, not copy. */
  readonly favouriteUnits: readonly string[];
  /** Extra expense categories seeded ON TOP of the nine system ones. */
  readonly extraExpenseCategoryIds: readonly string[];
}

export const BUSINESS_TYPE_CONFIG: Readonly<Record<BusinessType, BusinessTypeConfig>> = {
  retail: {
    value: 'retail',
    icon: Store,
    labelId: 'onboarding.type.retail',
    hintId: 'onboarding.type.retail.hint',
    inventoryEnabled: true,
    defaultDueDays: 7,
    favouriteUnits: ['NOS', 'KGS', 'GMS', 'LTR', 'PAC'],
    extraExpenseCategoryIds: ['onboarding.expense.packaging', 'onboarding.expense.shopMaintenance'],
  },
  wholesale: {
    value: 'wholesale',
    icon: Warehouse,
    labelId: 'onboarding.type.wholesale',
    hintId: 'onboarding.type.wholesale.hint',
    inventoryEnabled: true,
    defaultDueDays: 15,
    favouriteUnits: ['NOS', 'BOX', 'BAG', 'KGS', 'QTL', 'DOZ'],
    extraExpenseCategoryIds: ['onboarding.expense.loading', 'onboarding.expense.godownRent'],
  },
  distribution: {
    value: 'distribution',
    icon: Truck,
    labelId: 'onboarding.type.distribution',
    hintId: 'onboarding.type.distribution.hint',
    inventoryEnabled: true,
    defaultDueDays: 15,
    favouriteUnits: ['BOX', 'PAC', 'NOS', 'BAG', 'DOZ'],
    extraExpenseCategoryIds: [
      'onboarding.expense.fuel',
      'onboarding.expense.vehicleMaintenance',
      'onboarding.expense.schemeDiscounts',
    ],
  },
  services: {
    value: 'services',
    icon: Wrench,
    labelId: 'onboarding.type.services',
    hintId: 'onboarding.type.services.hint',
    inventoryEnabled: false,
    defaultDueDays: 30,
    favouriteUnits: ['NOS'],
    extraExpenseCategoryIds: ['onboarding.expense.tools', 'onboarding.expense.travel'],
  },
  trader: {
    value: 'trader',
    icon: Scale,
    labelId: 'onboarding.type.trader',
    hintId: 'onboarding.type.trader.hint',
    inventoryEnabled: true,
    defaultDueDays: 15,
    favouriteUnits: ['KGS', 'QTL', 'TON', 'BAG', 'NOS'],
    extraExpenseCategoryIds: ['onboarding.expense.commission', 'onboarding.expense.mandi'],
  },
  manufacturer: {
    value: 'manufacturer',
    icon: Factory,
    labelId: 'onboarding.type.manufacturer',
    hintId: 'onboarding.type.manufacturer.hint',
    inventoryEnabled: true,
    defaultDueDays: 15,
    favouriteUnits: ['KGS', 'NOS', 'MTR', 'SET', 'LTR'],
    extraExpenseCategoryIds: [
      'onboarding.expense.rawMaterial',
      'onboarding.expense.jobWork',
      'onboarding.expense.machineMaintenance',
    ],
  },
  professional: {
    value: 'professional',
    icon: Briefcase,
    labelId: 'onboarding.type.professional',
    hintId: 'onboarding.type.professional.hint',
    inventoryEnabled: false,
    defaultDueDays: 30,
    favouriteUnits: ['NOS'],
    extraExpenseCategoryIds: [
      'onboarding.expense.professionalFees',
      'onboarding.expense.software',
      'onboarding.expense.travel',
    ],
  },
  food: {
    value: 'food',
    icon: UtensilsCrossed,
    labelId: 'onboarding.type.food',
    hintId: 'onboarding.type.food.hint',
    inventoryEnabled: true,
    defaultDueDays: 7,
    favouriteUnits: ['NOS', 'KGS', 'LTR', 'PAC', 'BTL'],
    extraExpenseCategoryIds: [
      'onboarding.expense.gas',
      'onboarding.expense.rawMaterial',
      'onboarding.expense.delivery',
    ],
  },
  other: {
    value: 'other',
    icon: Grid2x2,
    labelId: 'onboarding.type.other',
    hintId: 'onboarding.type.other.hint',
    inventoryEnabled: true,
    defaultDueDays: 30,
    favouriteUnits: ['NOS', 'KGS', 'LTR'],
    extraExpenseCategoryIds: [],
  },
};

/**
 * FR-7 — the modules every business gets, before `inventory` and before the
 * partner and plan intersection the server applies (EC-6: a partner without
 * `inventory` silently drops it and the summary says so).
 *
 * `team` in FR-7's list is `platform` in canon §0.3's module map — the client
 * uses the canon spelling, because `ModuleCode` is that list.
 */
export const BASE_MODULES: readonly ModuleCode[] = [
  'platform',
  'ledger',
  'parties',
  'sales',
  'purchases',
  'payments',
  'expenses',
  'reports',
  'notifications',
  'import_export',
];

/** FR-7 — the preset's modules for a type, before the server's intersection. */
export const presetModules = (type: BusinessType): readonly ModuleCode[] =>
  BUSINESS_TYPE_CONFIG[type].inventoryEnabled ? [...BASE_MODULES, 'inventory'] : BASE_MODULES;

/** PLT-03 §7 — the wizard is four steps and no more (§32.4.7's risk row). */
export const ONBOARDING_STEPS = [
  { key: 'business', labelId: 'onboarding.step1.title' },
  { key: 'gst', labelId: 'onboarding.step2.title' },
  { key: 'address', labelId: 'onboarding.step3.title' },
  { key: 'summary', labelId: 'onboarding.step4.title' },
] as const;

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/** FR-3 — the GST registration status, which decides the document kinds (BR-2). */
export const GST_TYPES = ['unregistered', 'composition', 'regular'] as const;
export type GstType = (typeof GST_TYPES)[number];
