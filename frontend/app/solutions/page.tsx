import { SolutionsPage } from 'modules/DigiKhaato/features/landing/components/SolutionsPage';
import { solutionMetadata } from 'modules/DigiKhaato/features/landing/utils/solutionMetadata';
export const metadata = solutionMetadata(
  '/solutions',
  'Business Management Solutions | YourKhata',
  'Explore YourKhata: one modular platform for business records, billing, inventory, library operations and loan collections. Choose the workflows you need.'
);
export default function Page(): React.JSX.Element {
  return <SolutionsPage />;
}
