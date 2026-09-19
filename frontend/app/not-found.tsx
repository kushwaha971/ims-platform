import { UbLink, UbStack, UbText } from 'src/design-system';
import { ROUTES } from 'src/routes';

/** Part 19 §19.12.1 — the root not-found page; no shell, no store. */
export default function NotFound(): React.JSX.Element {
  return (
    <UbStack
      as="main"
      align="center"
      justify="center"
      gap={4}
      className="min-h-dvh bg-canvas px-4 text-center"
    >
      <UbText as="h1" variant="h2">
        404
      </UbText>
      <UbText variant="body" tone="tertiary">
        This page does not exist.
      </UbText>
      <UbLink href={ROUTES.PARTIES} variant="body-medium">
        Go back
      </UbLink>
    </UbStack>
  );
}
