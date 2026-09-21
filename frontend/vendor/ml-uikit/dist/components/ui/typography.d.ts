import * as React from "react";
declare const sizeClasses: {
    readonly title: "text-[48px] leading-[64px]";
    readonly h1: "text-[40px] leading-[56px]";
    readonly h2: "text-[32px] leading-[48px]";
    readonly h3: "text-[24px] leading-[40px]";
    readonly h4: "text-[20px] leading-[32px]";
    readonly "2xl": "text-[24px] leading-[40px]";
    readonly xl: "text-[20px] leading-[32px]";
    readonly l: "text-[16px] leading-[24px]";
    readonly base: "text-[14px] leading-[20px]";
    readonly s: "text-[12px] leading-[16px]";
    readonly xs: "text-[10px] leading-[16px]";
};
declare const weightClasses: {
    readonly bold: "font-bold";
    readonly semibold: "font-semibold";
    readonly medium: "font-medium";
    readonly regular: "font-normal";
    readonly light: "font-light";
};
type TypographySize = keyof typeof sizeClasses;
type TypographyWeight = keyof typeof weightClasses;
declare const typographyVariants: {
    readonly title: {
        readonly size: "title";
        readonly weight: "bold";
        readonly element: "h1";
    };
    readonly h1: {
        readonly size: "h1";
        readonly weight: "semibold";
        readonly element: "h1";
    };
    readonly h2: {
        readonly size: "h2";
        readonly weight: "semibold";
        readonly element: "h2";
    };
    readonly h3: {
        readonly size: "h3";
        readonly weight: "semibold";
        readonly element: "h3";
    };
    readonly h4: {
        readonly size: "h4";
        readonly weight: "semibold";
        readonly element: "h4";
    };
    readonly "body-2xl-semibold": {
        readonly size: "2xl";
        readonly weight: "semibold";
        readonly element: "p";
    };
    readonly "body-2xl-medium": {
        readonly size: "2xl";
        readonly weight: "medium";
        readonly element: "p";
    };
    readonly "body-2xl-regular": {
        readonly size: "2xl";
        readonly weight: "regular";
        readonly element: "p";
    };
    readonly "body-xl-semibold": {
        readonly size: "xl";
        readonly weight: "semibold";
        readonly element: "p";
    };
    readonly "body-xl-medium": {
        readonly size: "xl";
        readonly weight: "medium";
        readonly element: "p";
    };
    readonly "body-xl-regular": {
        readonly size: "xl";
        readonly weight: "regular";
        readonly element: "p";
    };
    readonly "body-l-semibold": {
        readonly size: "l";
        readonly weight: "semibold";
        readonly element: "p";
    };
    readonly "body-l-medium": {
        readonly size: "l";
        readonly weight: "medium";
        readonly element: "p";
    };
    readonly "body-l-regular": {
        readonly size: "l";
        readonly weight: "regular";
        readonly element: "p";
    };
    readonly "body-l-light": {
        readonly size: "l";
        readonly weight: "light";
        readonly element: "p";
    };
    readonly "body-base-semibold": {
        readonly size: "base";
        readonly weight: "semibold";
        readonly element: "p";
    };
    readonly "body-base-medium": {
        readonly size: "base";
        readonly weight: "medium";
        readonly element: "p";
    };
    readonly "body-base-regular": {
        readonly size: "base";
        readonly weight: "regular";
        readonly element: "p";
    };
    readonly "body-base-light": {
        readonly size: "base";
        readonly weight: "light";
        readonly element: "p";
    };
    readonly "body-s-semibold": {
        readonly size: "s";
        readonly weight: "semibold";
        readonly element: "p";
    };
    readonly "body-s-medium": {
        readonly size: "s";
        readonly weight: "medium";
        readonly element: "p";
    };
    readonly "body-s-regular": {
        readonly size: "s";
        readonly weight: "regular";
        readonly element: "p";
    };
    readonly "body-s-light": {
        readonly size: "s";
        readonly weight: "light";
        readonly element: "p";
    };
    readonly "body-xs-semibold": {
        readonly size: "xs";
        readonly weight: "semibold";
        readonly element: "p";
    };
    readonly "body-xs-medium": {
        readonly size: "xs";
        readonly weight: "medium";
        readonly element: "p";
    };
    readonly "body-xs-regular": {
        readonly size: "xs";
        readonly weight: "regular";
        readonly element: "p";
    };
    readonly "body-xs-light": {
        readonly size: "xs";
        readonly weight: "light";
        readonly element: "p";
    };
};
type TypographyVariant = keyof typeof typographyVariants;
interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
    size?: TypographySize;
    weight?: TypographyWeight;
    variant?: TypographyVariant;
    as?: React.ElementType;
}
declare const Typography: React.ForwardRefExoticComponent<TypographyProps & React.RefAttributes<HTMLElement>>;
export { Typography, typographyVariants };
export type { TypographyProps, TypographySize, TypographyVariant, TypographyWeight };
//# sourceMappingURL=typography.d.ts.map