import * as React from "react";
import { Button } from '../../components/ui/button';
type IconButtonSize = "mini" | "sm" | "md" | "lg";
export interface IconButtonProps extends Omit<React.ComponentProps<typeof Button>, "size"> {
    size?: IconButtonSize;
}
declare const IconButton: React.ForwardRefExoticComponent<Omit<IconButtonProps, "ref"> & React.RefAttributes<HTMLButtonElement>>;
export { IconButton };
//# sourceMappingURL=icon-button.d.ts.map