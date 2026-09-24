"""Read-mostly Django admin for support (super-admin only)."""

from __future__ import annotations

from typing import Any

from django import forms
from django.contrib import admin
from django.db import transaction
from django.db.models import Count

from apps.platform_app.models import Job, Partner, Plan, Tenant, User
from apps.platform_app.services.partners import record_partner_change
from apps.platform_app.services.partners import snapshot as partner_snapshot
from apps.platform_app.services.partners import validate_partner


class PartnerAdminForm(forms.ModelForm):
    """WLB-02 §10's rules, applied by the only writer of partners at MVP."""

    class Meta:
        model = Partner
        fields = (
            "code",
            "name",
            "status",
            "branding",
            "allowed_modules",
            "default_plan",
            "support_contact",
            "hostnames",
            "settings",
        )
        help_texts = {
            "code": "Lowercase letters, numbers, underscore. Cannot change later.",
            "branding": (
                "JSON: primary_hex, secondary_hex, app_name, doc_footer, legal_footer "
                "(printed on every document), locked_keys (merchants cannot change these: "
                "primary_hex, secondary_hex, app_name, doc_footer, logo)."
            ),
            "support_contact": 'JSON: {"name", "phone", "whatsapp", "email", "hours"}.',
        }

    def clean(self) -> dict:
        cleaned = super().clean()
        # `_state.adding`, not `pk is None`: a uuid7 primary key has a default,
        # so an unsaved partner already HAS a pk and would read as an edit.
        if not self.instance._state.adding:
            cleaned["code"] = self.instance.code
        errors = validate_partner(cleaned, instance=self.instance)
        for field, messages in errors.items():
            target = field if field in self.fields else None
            for message in messages:
                self.add_error(target, message)
        return cleaned


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    """WLB-02 at MVP: super admin only (Django admin's own gate is `is_super_admin`)."""

    form = PartnerAdminForm
    list_display = ("code", "name", "status", "default_plan", "tenant_count")
    list_filter = ("status",)
    search_fields = ("code", "name")

    def get_readonly_fields(self, request: Any, obj: Any = None) -> tuple[str, ...]:
        # FR-1: `code` is immutable after create — hostnames and analytics key on it.
        return ("code",) if obj is not None else ()

    def get_queryset(self, request: Any) -> Any:
        return super().get_queryset(request).annotate(_tenant_count=Count("tenants"))

    @admin.display(description="Tenants", ordering="_tenant_count")
    def tenant_count(self, obj: Any) -> int:
        return getattr(obj, "_tenant_count", 0)

    def save_model(self, request: Any, obj: Any, form: Any, change: bool) -> None:
        before = partner_snapshot(Partner.objects.get(pk=obj.pk)) if change else None
        with transaction.atomic():
            super().save_model(request, obj, form, change)
            record_partner_change(partner=obj, before=before, actor=request.user)

    def has_delete_permission(self, request: Any, obj: Any = None) -> bool:
        # BR-1: `metis` cannot be deleted; no partner with tenants can be either
        # (the FK is RESTRICT). Suspension is the reversible tool (BR-4).
        return False


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "partner", "plan", "status", "gst_type")
    list_filter = ("status", "gst_type", "business_type")
    search_fields = ("name", "gstin", "phone")


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "full_name", "mobile", "is_active", "is_super_admin")
    search_fields = ("email", "mobile", "full_name")


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("job_type", "status", "priority", "attempts", "run_after", "tenant")
    list_filter = ("status", "job_type")
    readonly_fields = ("payload", "result", "error")
