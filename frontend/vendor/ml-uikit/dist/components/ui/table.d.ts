import * as React from "react";
declare const Table: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableElement> & {
    pagination?: React.ReactNode;
    maxHeight?: string | number | undefined;
    scrollContainerClassName?: string | undefined;
    stickyHeader?: boolean | undefined;
} & React.RefAttributes<HTMLTableElement>>;
declare const TableHeader: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
declare const TableBody: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
declare const TableFooter: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
declare const TableRow: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableRowElement> & React.RefAttributes<HTMLTableRowElement>>;
declare const TableHead: React.ForwardRefExoticComponent<React.ThHTMLAttributes<HTMLTableCellElement> & React.RefAttributes<HTMLTableCellElement>>;
declare const TableCell: React.ForwardRefExoticComponent<React.TdHTMLAttributes<HTMLTableCellElement> & React.RefAttributes<HTMLTableCellElement>>;
declare const TableCaption: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableCaptionElement> & React.RefAttributes<HTMLTableCaptionElement>>;
declare const TablePagination: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const TablePaginationEntries: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    label?: string | undefined;
    count?: string | number | undefined;
} & React.RefAttributes<HTMLDivElement>>;
declare const TablePaginationContent: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const TablePaginationPages: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const TablePaginationButton: React.ForwardRefExoticComponent<React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>>;
declare const TablePaginationPage: React.ForwardRefExoticComponent<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    isActive?: boolean | undefined;
} & React.RefAttributes<HTMLButtonElement>>;
declare const TablePaginationTotalEntries: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    label?: string | undefined;
    total?: string | number | undefined;
} & React.RefAttributes<HTMLDivElement>>;
declare const TablePaginationGoTo: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    label?: string | undefined;
    pageLabel?: string | undefined;
    placeholder?: string | undefined;
    icon?: React.ReactNode;
} & React.RefAttributes<HTMLDivElement>>;
declare const TablePaginationIcon: ({ className, direction, }: {
    className?: string | undefined;
    direction: "left" | "right";
}) => import("react/jsx-dev-runtime").JSX.Element;
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, TablePagination, TablePaginationEntries, TablePaginationContent, TablePaginationPages, TablePaginationButton, TablePaginationPage, TablePaginationTotalEntries, TablePaginationGoTo, TablePaginationIcon, };
//# sourceMappingURL=table.d.ts.map