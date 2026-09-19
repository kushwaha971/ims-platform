"""Read-mostly Django admin for support (super-admin only)."""

from __future__ import annotations

from django.contrib import admin

from apps.parties.models import Party


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    list_display = ("name", "mobile", "tenant", "balance", "status")
    list_filter = ("status", "is_customer", "is_supplier")
    search_fields = ("name", "mobile")
    readonly_fields = ("balance", "receivable_total", "payable_total")
