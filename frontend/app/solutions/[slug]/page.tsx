import { notFound } from 'next/navigation';

import { SolutionsPage } from 'modules/DigiKhaato/features/landing/components/SolutionsPage';
import { SOLUTIONS, solutionBySlug } from 'modules/DigiKhaato/features/landing/config/solutions';
import { solutionMetadata } from 'modules/DigiKhaato/features/landing/utils/solutionMetadata';

import type { Metadata } from 'next';
type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = (): { slug: string }[] =>
  SOLUTIONS.map(({ slug }) => ({ slug }));
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const solution = solutionBySlug(slug);
  if (!solution) notFound();
  return solutionMetadata(`/solutions/${slug}`, solution.title, solution.description);
}
export default async function Page({ params }: Props): Promise<React.JSX.Element> {
  const { slug } = await params;
  const solution = solutionBySlug(slug);
  if (!solution) notFound();
  return <SolutionsPage solution={solution} />;
}
