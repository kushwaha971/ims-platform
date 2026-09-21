import * as React from "react";
import { type VariantProps } from "class-variance-authority";
type AlertState = "warning" | "neutral" | "success" | "negative";
declare const Alert: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & VariantProps<(props?: ({
    variant?: "default" | "destructive" | "success" | "error" | "warning" | "info" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    icon?: React.ReactNode;
    showIcon?: boolean | undefined;
    state?: AlertState | undefined;
    action?: React.ReactNode;
} & React.RefAttributes<HTMLDivElement>>;
declare const AlertTitle: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLHeadingElement> & React.RefAttributes<HTMLParagraphElement>>;
declare const AlertDescription: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>>;
export { Alert, AlertTitle, AlertDescription };
//# sourceMappingURL=alert.d.ts.map