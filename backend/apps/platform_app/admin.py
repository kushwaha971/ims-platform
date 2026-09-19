"""Read-mostly Django admin for support (super-admin only)."""

from __future__ import annotations

from django.contrib import admin

from apps.platform_app.models import Job, Partner, Plan, Tenant, User


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "status")
    search_fields = ("code", "name")


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
    list_display = ("mobile", "full_name", "is_active", "is_super_admin")
    search_fields = ("mobile", "full_name")


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("job_type", "status", "priority", "attempts", "run_after", "tenant")
    list_filter = ("status", "job_type")
    readonly_fields = ("payload", "result", "error")
