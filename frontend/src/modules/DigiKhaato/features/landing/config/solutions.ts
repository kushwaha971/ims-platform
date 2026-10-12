/** Public solution pages describe shipped workflows, not future module promises.
 * Add a reviewed entry here when a new module launches; routes and sitemap follow it.
 */
export interface Solution {
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly audience: string;
  readonly problem: string;
  readonly features: readonly string[];
  readonly steps: readonly string[];
  readonly questions: readonly { question: string; answer: string }[];
}
export const SOLUTIONS: readonly Solution[] = [
  {
    slug: 'shop-billing',
    name: 'Shop billing and inventory',
    title: 'Shop Billing & Inventory Software | YourKhata',
    description:
      'Create GST bills, track stock, record purchases and follow customer dues with YourKhata. Business records in one place, on phone or computer.',
    audience:
      'Retail shops and small businesses that sell products and need a clear record of stock, sales and customer balances.',
    problem:
      'A bill in one book, stock in a spreadsheet and unpaid balances in messages make it difficult to know what sold and what is still owed.',
    features: [
      'Create sales invoices and GST bills, with credit notes and delivery challans.',
      'Record purchases and view stock movements and low-stock items.',
      'Keep customer and supplier balances alongside recorded payments.',
      'Review sales, purchases, expenses and business reports.',
    ],
    steps: [
      'Add your business, customers, suppliers and items.',
      'Record opening stock, purchases and sales as they happen.',
      'Review balances and reports before following up on dues.',
    ],
    questions: [
      {
        question: 'Can I track billing and inventory together?',
        answer:
          'Yes. The Shop module includes sales, purchases and inventory records, alongside customer and supplier accounts.',
      },
      {
        question: 'Does YourKhata replace tax filing advice?',
        answer:
          'No. YourKhata helps record GST bills and produce business reports. Check tax treatment and filing obligations with your accountant.',
      },
    ],
  },
  {
    slug: 'library-management',
    name: 'Library and study-space management',
    title: 'Library & Study-Space Management | YourKhata',
    description:
      'Manage library members, seats, attendance, fees, books and lending records with YourKhata. Keep daily library work together in one browser-based platform.',
    audience:
      'Independent libraries and reading or study spaces that manage memberships, seats, attendance or a book collection.',
    problem:
      'Separate registers for members, seat assignments, fees and book loans make daily checks and payment follow-ups harder.',
    features: [
      'Maintain member records, memberships and seat assignments.',
      'Record attendance and use the member self check-in workflow.',
      'Track fees and library money records.',
      'Manage a book catalogue, copies, issue and return records.',
    ],
    steps: [
      'Set up your library, seats and membership options.',
      'Add members and your book catalogue when applicable.',
      'Record attendance, fees and book movements in the daily workflow.',
    ],
    questions: [
      {
        question: 'Is this only for libraries that lend books?',
        answer:
          'No. The module also supports members, seats, attendance and fees for reading and study spaces. Book catalogue and circulation workflows are available when needed.',
      },
      {
        question: 'Can staff use the same platform?',
        answer:
          'YourKhata includes team access and roles. Assign permissions appropriate to each staff member rather than sharing the owner login.',
      },
    ],
  },
  {
    slug: 'lending-collections',
    name: 'Lending records and collections',
    title: 'Loan Records & Collection Software | YourKhata',
    description:
      'Keep borrower records, loans, repayments and daily collections organized with YourKhata. Review outstanding balances and record collections in one place.',
    audience:
      'Businesses managing their own lawful lending records and teams that need to record borrower repayments and collections.',
    problem:
      'Repayments recorded in separate notebooks can be difficult to match to borrowers, loans and outstanding balances.',
    features: [
      'Maintain borrower records and individual loan records.',
      'Record repayments and review outstanding loan balances.',
      'Use daily collection workflows and collection routes.',
      'Review lending reports and records before following up with a borrower.',
    ],
    steps: [
      'Set up your lending business and borrower records.',
      'Record each loan and its agreed repayment details.',
      'Record collections against the right borrower and review balances.',
    ],
    questions: [
      {
        question: 'Does YourKhata provide loans or approve borrowers?',
        answer:
          'No. YourKhata is business record-management software. It does not provide credit, make lending decisions or grant lending licences.',
      },
      {
        question: 'Can I manage a shop and lending records with one account?',
        answer:
          'YourKhata supports separate business books under one login. Select the appropriate business so records and staff access remain separate.',
      },
    ],
  },
];
export const solutionBySlug = (slug: string): Solution | undefined =>
  SOLUTIONS.find((solution) => solution.slug === slug);
