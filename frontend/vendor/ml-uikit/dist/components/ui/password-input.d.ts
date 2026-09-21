import * as React from "react";
type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
    showLabel?: string;
    hideLabel?: string;
};
declare const PasswordInput: React.ForwardRefExoticComponent<Omit<PasswordInputProps, "ref"> & React.RefAttributes<HTMLInputElement>>;
export { PasswordInput };
export type { PasswordInputProps };
//# sourceMappingURL=password-input.d.ts.map