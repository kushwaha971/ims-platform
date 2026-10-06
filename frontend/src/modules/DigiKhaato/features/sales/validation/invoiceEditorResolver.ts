import type { TranslateFn } from 'src/hooks/useTranslation';

import type { InvoiceSchemaContext, InvoiceSchemaOptions } from './invoiceEditorSchema';
import type { InvoiceFormValues } from '../view-model/invoiceForm';
import type { Resolver } from 'react-hook-form';

/**
 * The bill editor's resolver, with Yup loaded on first use.
 *
 * Importing the schema statically put Yup and `@hookform/resolvers` into the
 * route chunk of /sales/invoices/new — +17.9 KB gz on the screen a counter
 * opens all day, paid before the merchant has typed anything. Validation only
 * runs on a blur or an Issue, so the first one waits for a chunk that is
 * usually already prefetched; every later one reuses the built resolver.
 *
 * Only `import type` here: a value import from either module would pull it
 * back into the route.
 */
export const lazyInvoiceResolver = (
  t: TranslateFn,
  options: InvoiceSchemaOptions
): Resolver<InvoiceFormValues, InvoiceSchemaContext> => {
  let built: Promise<Resolver<InvoiceFormValues, InvoiceSchemaContext>> | null = null;
  return async (values, context, resolverOptions) => {
    built ??= Promise.all([
      import('./invoiceEditorSchema'),
      import('@hookform/resolvers/yup'),
    ]).then(
      ([schema, resolvers]) =>
        resolvers.yupResolver(schema.buildInvoiceEditorSchema(t, options)) as unknown as Resolver<
          InvoiceFormValues,
          InvoiceSchemaContext
        >
    );
    return (await built)(values, context, resolverOptions);
  };
};
