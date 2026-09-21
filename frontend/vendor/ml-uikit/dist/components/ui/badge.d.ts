import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const badgeVariants: (props?: ({
    variant?: "color" | "outline-neutral" | "destructive" | "success" | "warning" | "neutral" | "outline-color" | null | undefined;
    size?: "default" | "large" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]> | "default" | "secondary" | "outline";
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, Omit<VariantProps<typeof badgeVariants>, "variant"> {
    variant?: BadgeVariant;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    showX?: boolean;
    onXClick?: React.MouseEventHandler<HTMLButtonElement>;
    xIcon?: React.ReactNode;
    bgColor?: string;
    textColor?: string;
    borderColor?: string;
}
declare function Badge({ className, variant, size, leftIcon, rightIcon, showX, onXClick, xIcon, bgColor, textColor, borderColor, style, children, ...props }: BadgeProps): import("react/jsx-dev-runtime").JSX.Element;
export { Badge, badgeVariants };
//# sourceMappingURL=badge.d.ts.map