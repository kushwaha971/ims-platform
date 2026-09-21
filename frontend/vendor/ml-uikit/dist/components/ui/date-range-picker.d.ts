import * as React from "react";
import { PopoverContent } from '../../components/ui/popover';
export type DateRangePickerValue = {
    from?: Date;
    to?: Date;
};
export interface DateRangePickerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "defaultValue" | "onChange"> {
    value?: DateRangePickerValue;
    defaultValue?: DateRangePickerValue;
    onValueChange?: (value: DateRangePickerValue | undefined) => void;
    wrapperClassName?: string;
    popoverClassName?: string;
    popoverSide?: React.ComponentPropsWithoutRef<typeof PopoverContent>["side"];
    popoverAvoidCollisions?: boolean;
    placeholder?: string;
    dateFormat?: string;
    minYear?: number;
    maxYear?: number;
}
declare const DateRangePicker: React.ForwardRefExoticComponent<DateRangePickerProps & React.RefAttributes<HTMLButtonElement>>;
export { DateRangePicker };
//# sourceMappingURL=date-range-picker.d.ts.map