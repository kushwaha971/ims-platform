"""URL routes for the library vertical, mounted at `/api/v1/library/`.

B03 settings, B05 the catalogue, B06 membership types and loan rules. Every route is behind
`ModuleEnabled("library")`, which refuses an unreleased module first (A1).
"""

from __future__ import annotations

from django.urls import path

from apps.library.views import LibraryNumberingView, LibrarySettingsView
from apps.library.views import catalogue as c
from apps.library.views import charges as ch
from apps.library.views import holds as hd
from apps.library.views import loans as ln
from apps.library.views import members as m
from apps.library.views import memberships as mb
from apps.library.views import reminders as rm

urlpatterns: list = [
    path("settings", LibrarySettingsView.as_view(), name="library-settings"),
    path("settings/numbering", LibraryNumberingView.as_view(), name="library-settings-numbering"),
    # ── B05 ── the catalogue (LIB-02 §6)
    path("titles", c.TitleListView.as_view(), name="library-titles"),
    path("titles/<uuid:title_id>", c.TitleDetailView.as_view(), name="library-title"),
    path("titles/<uuid:title_id>/copies", c.TitleCopiesView.as_view(), name="library-title-copies"),
    path(
        "titles/<uuid:title_id>/archive", c.TitleArchiveView.as_view(), name="library-title-archive"
    ),
    path(
        "titles/<uuid:title_id>/restore", c.TitleRestoreView.as_view(), name="library-title-restore"
    ),
    path("copies", c.CopyListView.as_view(), name="library-copies"),
    path("copies/<uuid:copy_id>", c.CopyDetailView.as_view(), name="library-copy"),
    path(
        "copies/<uuid:copy_id>/withdraw", c.CopyWithdrawView.as_view(), name="library-copy-withdraw"
    ),
    path("copies/<uuid:copy_id>/repair", c.CopyRepairView.as_view(), name="library-copy-repair"),
    path(
        "copies/<uuid:copy_id>/back-to-shelf",
        c.CopyBackToShelfView.as_view(),
        name="library-copy-back-to-shelf",
    ),
    path("lookup", c.LookupView.as_view(), name="library-lookup"),
    path("categories", c.CategoryListView.as_view(), name="library-categories"),
    path("categories/<uuid:category_id>", c.CategoryDetailView.as_view(), name="library-category"),
    path(
        "categories/<uuid:category_id>/merge",
        c.CategoryMergeView.as_view(),
        name="library-category-merge",
    ),
    path("locations", c.LocationListView.as_view(), name="library-locations"),
    path("locations/<uuid:location_id>", c.LocationDetailView.as_view(), name="library-location"),
    # ── B06 ── membership types and loan rules (LIB-04 §6, LIB-05 §6)
    path("membership-types", m.MembershipTypeListView.as_view(), name="library-membership-types"),
    path(
        "membership-types/<uuid:type_id>",
        m.MembershipTypeDetailView.as_view(),
        name="library-membership-type",
    ),
    path("loan-rules", m.LoanRuleView.as_view(), name="library-loan-rules"),
    # ── B10 ── charges and waivers (LIB-07 §6)
    path("charges", ch.ChargeListView.as_view(), name="library-charges"),
    path("charges/<uuid:charge_id>", ch.ChargeDetailView.as_view(), name="library-charge"),
    path(
        "charges/<uuid:charge_id>/waive", ch.ChargeWaiveView.as_view(), name="library-charge-waive"
    ),
    path(
        "charges/<uuid:charge_id>/reverse",
        ch.ChargeReverseView.as_view(),
        name="library-charge-reverse",
    ),
    # ── B07 ── members (LIB-04 §6)
    path("members", mb.MemberListView.as_view(), name="library-members"),
    path("members/<uuid:membership_id>", mb.MemberDetailView.as_view(), name="library-member"),
    *[
        path(
            f"members/<uuid:membership_id>/{suffix}", view.as_view(), name=f"library-member-{name}"
        )
        for suffix, name, view in (
            ("renew", "renew", mb.MemberRenewView),
            ("change-type", "change-type", mb.MemberChangeTypeView),
            ("suspend", "suspend", mb.MemberSuspendView),
            ("reactivate", "reactivate", mb.MemberReactivateView),
            ("close", "close", mb.MemberCloseView),
            ("rejoin", "rejoin", mb.MemberRejoinView),
            ("deposit/receive", "deposit-receive", mb.MemberDepositReceiveView),
            ("deposit/apply", "deposit-apply", mb.MemberDepositApplyView),
            ("deposit/refund", "deposit-refund", mb.MemberDepositRefundView),
            ("renew-all", "renew-all", ln.MemberRenewAllView),
            ("summary", "summary", ln.MemberCounterSummaryView),
        )
    ],
    # ── B09 ── loans and the counter (LIB-06 §6), due dates over holidays (LIB-05 §6)
    path("loans", ln.LoanListView.as_view(), name="library-loans"),
    path("loans/due-on", ln.DueOnView.as_view(), name="library-loans-due-on"),
    path("loans/shift-due", ln.ShiftDueView.as_view(), name="library-loans-shift-due"),
    path("loans/<uuid:loan_id>", ln.LoanDetailView.as_view(), name="library-loan"),
    path("loans/<uuid:loan_id>/renew", ln.LoanRenewView.as_view(), name="library-loan-renew"),
    path("loans/<uuid:loan_id>/cancel", ln.LoanCancelView.as_view(), name="library-loan-cancel"),
    path(
        "loans/<uuid:loan_id>/change-due",
        ln.LoanChangeDueView.as_view(),
        name="library-loan-change-due",
    ),
    path("loans/<uuid:loan_id>/lost", ln.LoanLostView.as_view(), name="library-loan-lost"),
    path("loans/<uuid:loan_id>/replace", ln.LoanReplaceView.as_view(), name="library-loan-replace"),
    path(
        "loans/<uuid:loan_id>/fine-preview",
        ln.LoanFinePreviewView.as_view(),
        name="library-loan-fine-preview",
    ),
    path("copies/<uuid:copy_id>/found", ln.CopyFoundView.as_view(), name="library-copy-found"),
    path("returns", ln.ReturnView.as_view(), name="library-returns"),
    path("due-date-preview", ln.DueDatePreviewView.as_view(), name="library-due-date-preview"),
    # ── B11 ── holds (LIB-08 §6)
    path("holds", hd.HoldListView.as_view(), name="library-holds"),
    path(
        "holds/<uuid:hold_id>/set-aside",
        hd.HoldSetAsideView.as_view(),
        name="library-hold-set-aside",
    ),
    path("holds/<uuid:hold_id>/cancel", hd.HoldCancelView.as_view(), name="library-hold-cancel"),
    path("holds/<uuid:hold_id>/extend", hd.HoldExtendView.as_view(), name="library-hold-extend"),
    path("holds/<uuid:hold_id>/move", hd.HoldMoveView.as_view(), name="library-hold-move"),
    path("titles/<uuid:title_id>/holds", hd.TitleHoldsView.as_view(), name="library-title-holds"),
    # ── B12 ── reminders and the issue slip (LIB-09 §6)
    path("overdue", rm.OverdueListView.as_view(), name="library-overdue"),
    path(
        "overdue/bulk-prepare",
        rm.OverdueBulkPrepareView.as_view(),
        name="library-overdue-bulk-prepare",
    ),
    path(
        "overdue/<uuid:membership_id>/preview",
        rm.OverduePreviewView.as_view(),
        name="library-overdue-preview",
    ),
    path(
        "overdue/<uuid:membership_id>/remind",
        rm.OverdueRemindView.as_view(),
        name="library-overdue-remind",
    ),
    path("holds/<uuid:hold_id>/remind", rm.HoldRemindView.as_view(), name="library-hold-remind"),
    path(
        "members/<uuid:membership_id>/slip", rm.MemberSlipView.as_view(), name="library-member-slip"
    ),
]
