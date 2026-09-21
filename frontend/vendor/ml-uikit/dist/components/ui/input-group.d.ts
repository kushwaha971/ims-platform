import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { Button } from '../../components/ui/button';
declare function InputGroup({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-dev-runtime").JSX.Element;
declare const inputGroupAddonVariants: (props?: ({
    align?: "inline-end" | "inline-start" | "block-end" | "block-start" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare function InputGroupAddon({ className, align, ...props }: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>): import("react/jsx-dev-runtime").JSX.Element;
declare const inputGroupButtonVariants: (props?: ({
    size?: "sm" | "icon-sm" | "xs" | "icon-xs" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare function InputGroupButton({ className, type, variant, size, ...props }: Omit<React.ComponentProps<typeof Button>, "size"> & VariantProps<typeof inputGroupButtonVariants>): import("react/jsx-dev-runtime").JSX.Element;
declare function InputGroupText({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-dev-runtime").JSX.Element;
declare function InputGroupInput({ className, ...props }: React.ComponentProps<"input">): import("react/jsx-dev-runtime").JSX.Element;
declare function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">): import("react/jsx-dev-runtime").JSX.Element;
export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea, };
//# sourceMappingURL=input-group.d.ts.map