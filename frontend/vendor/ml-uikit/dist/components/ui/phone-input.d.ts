import * as React from "react";
import { type PhoneCountryOption } from "./phone-countries";
declare const DEFAULT_COUNTRY_OPTIONS: PhoneCountryOption[];
export interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "className"> {
    className?: string;
    inputClassName?: string;
    label?: string;
    helperText?: string;
    error?: string;
    country?: string;
    defaultCountry?: string;
    countryOptions?: PhoneCountryOption[];
    onCountryChange?: (country: PhoneCountryOption) => void;
}
declare const PhoneInput: React.ForwardRefExoticComponent<Omit<PhoneInputProps, "ref"> & React.RefAttributes<HTMLInputElement>>;
export { PhoneInput, DEFAULT_COUNTRY_OPTIONS };
export type { PhoneCountryOption };
//# sourceMappingURL=phone-input.d.ts.map