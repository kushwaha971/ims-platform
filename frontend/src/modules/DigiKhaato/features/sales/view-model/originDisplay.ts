import type { DocumentOrigin } from '../types/sales.types';

/**
 * A5 (FRD 00 PLT-X05 §8) — the words of an origin badge: "From Gym · Membership M-0042".
 *
 * The module's name is ours (a closed set of module codes); the label after it is the module's
 * own ("Record not found" when the module no longer answers for it, EC-4). A module code this
 * map does not know yet is shown as the code — a new module appearing unnamed is a visible,
 * harmless gap, where hiding its badge would lose the fact the document came from somewhere.
 */
export const ORIGIN_MODULE_IDS: Readonly<Record<string, string>> = {
  dues: 'sales.origin.module.dues',
  gym: 'sales.origin.module.gym',
  hospitality: 'sales.origin.module.hospitality',
  lending: 'sales.origin.module.lending',
  library: 'sales.origin.module.library',
};

export interface OriginWords {
  readonly id: 'sales.origin.from' | 'sales.origin.fromWithLabel';
  readonly moduleId: string | null;
  readonly module: string;
  readonly label: string | null;
}

export const originWords = (origin: DocumentOrigin): OriginWords => {
  const moduleId = ORIGIN_MODULE_IDS[origin.module] ?? null;
  return {
    id: origin.label ? 'sales.origin.fromWithLabel' : 'sales.origin.from',
    moduleId,
    module: origin.module,
    label: origin.label,
  };
};
