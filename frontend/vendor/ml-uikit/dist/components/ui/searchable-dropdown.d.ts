import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
declare const SearchableDropdown: React.FC<DropdownMenuPrimitive.DropdownMenuProps>;
declare const SearchableDropdownTrigger: React.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuTriggerProps & React.RefAttributes<HTMLButtonElement>>;
declare const SearchableDropdownPortal: React.FC<DropdownMenuPrimitive.DropdownMenuPortalProps>;
declare const SearchableDropdownContent: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
    searchPlaceholder?: string | undefined;
    searchValue?: string | undefined;
    onSearchChange?: ((value: string) => void) | undefined;
    contentWidth?: React.CSSProperties["width"];
} & React.RefAttributes<HTMLDivElement>>;
declare const SearchableDropdownGroup: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuGroupProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
declare const SearchableDropdownItem: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuItemProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
    searchValue?: string | undefined;
    searchableText?: string | undefined;
    isSelected?: boolean | undefined;
} & React.RefAttributes<HTMLDivElement>>;
declare const SearchableDropdownEmpty: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const SearchableDropdownLabel: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const SearchableDropdownSeparator: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSeparatorProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
export { SearchableDropdown, SearchableDropdownTrigger, SearchableDropdownContent, SearchableDropdownItem, SearchableDropdownEmpty, SearchableDropdownLabel, SearchableDropdownSeparator, SearchableDropdownGroup, SearchableDropdownPortal, };
//# sourceMappingURL=searchable-dropdown.d.ts.map