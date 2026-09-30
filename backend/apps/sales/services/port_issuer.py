"""`SalesIssuer` — the sales side of the document port (A5, ADR-045, FRD 00 PLT-X05 §6).

Registered in `SalesConfig.ready()` on `apps.common.seams.documents`. A module's request becomes
an ordinary sales document through sales' own pipeline — `create_draft` then `issue_invoice`, in
the caller's transaction — so numbering, Rule 46, place of supply, the tax engine and the ledger
debit are exactly the counter's. What the port adds:

* the kind is `kind_for(tenant, None)` — never an estimate, never requested (BR-1);
* `party_id` is required (BR-2);
* the origin columns are stamped on the draft, and only here (BR-4);
* one standing document per `(origin_type, origin_id)` (BR-6): the party is locked first, so
  two racing issues for one origin serialise and the second returns the first's document;
* lines: `tax_code` wins; `gst_rate` alone maps through `tax.selectors.codes.code_for_rate`,
  and zero or several codes is 400 on `lines.N.gst_rate` (BR-7); an `item_id` with inventory
  off is 400 (EC-5); `discount_amount` is the line's amount discount; `unit_code` is `NOS`
  unless given.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.sales.constants import INVOICE_KINDS, CreditNoteReason, DocumentKind, Settlement
from apps.sales.services.origins import summary_of

ZERO = Decimal("0.00")
_LINE_KEYS = ("description", "hsn_sac", "qty", "unit_price", "tax_inclusive")


def _effective(tenant: Any) -> frozenset[str]:
    from apps.platform_app.services.entitlements import effective_modules

    return effective_modules(tenant)


def _map_lines(tenant: Any, lines: Any, on_date: Any) -> list[dict]:
    from apps.tax.selectors.codes import RateNotResolved, code_for_rate

    if not isinstance(lines, list) or not lines:
        raise ValidationFailed({"lines": ["Add at least one line."]})
    inventory_on = "inventory" in _effective(tenant)
    errors: dict[str, list[str]] = {}
    mapped: list[dict] = []
    for index, raw in enumerate(lines):
        raw = dict(raw or {})
        row: dict[str, Any] = {k: raw[k] for k in _LINE_KEYS if raw.get(k) is not None}
        row["unit_code"] = raw.get("unit_code") or "NOS"
        if raw.get("item_id"):
            if not inventory_on:
                errors[f"lines.{index}.item_id"] = ["Items are off; describe the line instead."]
            row["item_id"] = str(raw["item_id"])
        if raw.get("tax_code"):
            row["tax_code"] = raw["tax_code"]
        elif raw.get("gst_rate") is not None:
            try:
                row["tax_code"] = code_for_rate(tenant, raw["gst_rate"], on_date)
            except RateNotResolved as exc:
                errors[f"lines.{index}.gst_rate"] = [str(exc)]
        discount = raw.get("discount_amount")
        if discount not in (None, "", 0, ZERO):
            row["discount_type"] = "amount"
            row["discount_value"] = discount
        mapped.append(row)
    if errors:
        raise ValidationFailed(errors)
    return mapped


def _required(request: dict) -> None:
    from apps.common.seams import documents as port

    errors: dict[str, list[str]] = {}
    if not request.get("party_id"):
        errors["party_id"] = ["A module document needs a party (never walk-in)."]
    if not request.get("document_date"):
        errors["document_date"] = ["Enter the document date."]
    if not request.get("origin_id"):
        errors["origin_id"] = ["Name the record this document is for."]
    if errors:
        raise ValidationFailed(errors)
    if port.origin_for(request.get("origin_type")) is None:
        raise ValueError(f"{request.get('origin_type')!r} is not a registered origin type")


def _standing(tenant: Any, origin_type: str, origin_id: Any) -> Any:
    from apps.sales.models import SalesDocument

    return (
        SalesDocument.objects.filter(
            tenant=tenant, origin_type=origin_type, origin_id=origin_id, kind__in=INVOICE_KINDS
        )
        .exclude(status__in=("void", "draft"))
        .first()
    )


def _ledger_entry_ids(tenant: Any, ids: Any) -> dict[str, str]:
    from apps.ledger.models import LedgerEntry

    rows = LedgerEntry.objects.filter(
        tenant=tenant, source_type="sales_document", source_id__in=list(ids), reverses__isnull=True
    ).values_list("source_id", "id")
    return {str(source_id): entry_id for source_id, entry_id in rows}


def _refund_of(note: Any) -> dict | None:
    refund = (note.meta or {}).get("refund") or {}
    if not refund.get("payment_id") or note.amount_paid <= ZERO:
        return None
    return {"id": refund["payment_id"], "number": refund.get("number"), "amount": note.amount_paid}


def _stamp(document: Any, *, origin_module: str, origin_type: str, origin_id: Any) -> None:
    from apps.sales.models import SalesDocument

    SalesDocument.objects.filter(pk=document.pk).update(
        origin_module=origin_module, origin_type=origin_type, origin_id=origin_id
    )
    document.origin_module, document.origin_type, document.origin_id = (
        origin_module,
        origin_type,
        origin_id,
    )


class SalesIssuer:
    """The `Issuer` of `apps/common/seams/documents.py`."""

    def available(self, tenant: Any) -> bool:
        return "sales" in _effective(tenant)

    @transaction.atomic
    def issue(self, *, ctx: Ctx, request: dict) -> dict:
        from apps.common.seams import documents as port
        from apps.parties.models import Party
        from apps.sales.services.documents import create_draft
        from apps.sales.services.issue import issue_invoice
        from apps.sales.services.payload import kind_for

        request = dict(request)
        _required(request)
        origin = port.origin_for(request["origin_type"])
        tenant = ctx.tenant
        # BR-6 under the party lock: two racing issues for one origin serialise here.
        list(Party.objects.select_for_update().filter(tenant=tenant, pk=request["party_id"]))
        standing = _standing(tenant, request["origin_type"], request["origin_id"])
        if standing is not None:
            entry = _ledger_entry_ids(tenant, [standing.id]).get(str(standing.id))
            return {**summary_of(standing, ledger_entry_id=entry), "warnings": [], "existing": True}

        payload: dict[str, Any] = {
            "party_id": request["party_id"],
            "document_date": request["document_date"],
            "lines": _map_lines(tenant, request.get("lines"), request["document_date"]),
        }
        for key in ("due_on", "notes", "place_of_supply_state"):
            if request.get(key):
                payload[key] = request[key]
        draft = create_draft(ctx=ctx, payload=payload, kind=kind_for(tenant, None))["document"]
        _stamp(
            draft,
            origin_module=origin.module,
            origin_type=request["origin_type"],
            origin_id=request["origin_id"],
        )
        if request.get("meta_block"):
            from apps.sales.models import SalesDocument

            draft.meta = {**(draft.meta or {}), "origin_block": dict(request["meta_block"])}
            SalesDocument.objects.filter(pk=draft.pk).update(meta=draft.meta)
        credit_check = request.get("credit_check") or "enforce"
        result = issue_invoice(
            ctx=ctx,
            document_id=draft.id,
            payment=request.get("payment"),
            override=bool(request.get("override")) and credit_check == "enforce",
            credit_check=credit_check,
            apply_credit_note_ids=request.get("apply_credit_note_ids") or (),
            apply_payment_ids=request.get("apply_payment_ids") or (),
            apply_open_advances=bool(request.get("apply_open_advances")),
        )
        document = result["document"]
        document.refresh_from_db()
        return {
            **summary_of(document, ledger_entry_id=result["ledger_entry_id"]),
            "warnings": result["warnings"],
        }

    @transaction.atomic
    def issue_credit_note(
        self,
        *,
        ctx: Ctx,
        against_id: Any,
        origin_type: str,
        origin_id: Any,
        lines: Any,
        settlement: str,
        reason: str,
        refund: dict | None = None,
    ) -> dict:
        from apps.common.seams import documents as port
        from apps.sales.models import SalesDocument
        from apps.sales.services.credit_note_issue import issue_credit_note
        from apps.sales.services.credit_notes import create_credit_note

        origin = port.origin_for(origin_type)
        if origin is None:
            raise ValueError(f"{origin_type!r} is not a registered origin type")
        if settlement not in Settlement.values:
            raise ValidationFailed({"settlement": ["Choose hold as advance or refund now."]})
        rows = []
        for raw in lines or ():
            row = {
                "against_line_id": str(raw.get("against_line_id") or ""),
                "taxable_value": str(raw.get("taxable_value") or ""),
            }
            if raw.get("description"):
                row["description"] = raw["description"]
            rows.append(row)
        note = create_credit_note(
            ctx=ctx,
            payload={
                "against_id": against_id,
                "reason": CreditNoteReason.OTHER,
                "reason_note": reason,
                "restock": False,
                "settlement": settlement,
                "lines": rows,
            },
        )["document"]
        _stamp(note, origin_module=origin.module, origin_type=origin_type, origin_id=origin_id)
        if settlement == Settlement.REFUND and refund is None:
            invoice = SalesDocument.objects.get(pk=note.against_id)
            open_credit = note.grand_total - min(note.grand_total, invoice.amount_due)
            refund = (
                {"mode_breakup": [{"mode": "cash", "amount": str(open_credit)}]}
                if open_credit > ZERO
                else None
            )
            if refund is None:
                SalesDocument.objects.filter(pk=note.pk).update(
                    meta={**(note.meta or {}), "settlement": Settlement.HOLD_ADVANCE}
                )
        result = issue_credit_note(ctx=ctx, document_id=note.id, refund=refund)
        issued = result["document"]
        issued.refresh_from_db()
        return {
            **summary_of(
                issued, ledger_entry_id=result["ledger_entry_id"], refund_payment=_refund_of(issued)
            ),
            "warnings": result["warnings"],
        }

    @transaction.atomic
    def void(self, *, ctx: Ctx, document_id: Any, reason: str) -> dict:
        from apps.sales.models import SalesDocument
        from apps.sales.services.credit_note_apply import void_credit_note
        from apps.sales.services.void import void_invoice

        kind = (
            SalesDocument.objects.filter(tenant=ctx.tenant, pk=document_id)
            .values_list("kind", flat=True)
            .first()
        )
        if kind == DocumentKind.CREDIT_NOTE:
            result = void_credit_note(
                ctx=ctx, document_id=document_id, reason=reason, from_origin=True
            )
        else:
            result = void_invoice(ctx=ctx, document_id=document_id, reason=reason, from_origin=True)
        return {**result, "document": summary_of(result["document"])}

    def summaries(self, *, tenant: Any, ids: Any) -> dict[Any, dict]:
        from apps.sales.models import SalesDocument

        documents = list(SalesDocument.objects.filter(tenant=tenant, pk__in=list(ids)))
        entries = _ledger_entry_ids(tenant, [d.id for d in documents])
        return {
            d.id: summary_of(
                d,
                ledger_entry_id=entries.get(str(d.id)),
                refund_payment=_refund_of(d) if d.kind == DocumentKind.CREDIT_NOTE else None,
            )
            for d in documents
        }
