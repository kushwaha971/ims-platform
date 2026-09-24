"""PTY-10 — the parties mapper.

Validation mirrors PTY-01's rules row by row, from lookups loaded once; the
commit calls `create_party()` per row — the same function the party drawer
calls — which stores what the merchant typed and posts the opening balance
through LED-02's `post_opening_balance()` in the same transaction. No party row
and no ledger row is written by this module.

── Where this departs from PTY-10's own text, and why ───────────────────────
PTY-10 was written before IMP-01 and disagrees with it in three places. The
framework's rules win, because the sprint plan's exit criteria ("committing
twice creates no duplicates; a cancelled import leaves no partial data") and
TSK-PTY-10-02/03 are written against IMP-01:

 · **A mobile already in the book is an ERROR, not a skip or an update**
   (IMP-01 BR-3 create-only; EC-6 "the second validation reports the first
   import's rows as duplicates, which is the correct answer"). PTY-10 FR-6's
   `duplicate_mode` is IMP-03's upsert, not MVP.
 · **All-or-nothing, not chunked** (IMP-01 BR-1 against PTY-10 BR-7).
 · **No column-mapping screen** (PTY-10 FR-3). Headers are matched after case
   and space folding and against a synonym list, which covers the renamed
   columns FR-3 was for; `imports_job.column_map` is blocked behind C5 anyway.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.imports.registry import ColumnSpec, ImporterSpec, RowResult, register
from apps.imports.services import coerce
from apps.imports.services.coerce import CoerceError

#: GST state codes and their names (the 36 states and UTs plus Other Territory),
#: so a sheet may say "Maharashtra" or "27". `tax` validates codes but keeps no
#: names; the client's picker has them, and this is the one server-side reader.
STATE_NAMES: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
}
_STATE_BY_NAME = {name.lower(): code for code, name in STATE_NAMES.items()} | {
    "orissa": "21",
    "pondicherry": "34",
    "new delhi": "07",
    "j&k": "01",
}

TYPE_CHOICES = ("customer", "supplier", "both")
OPENING_CHOICES = ("to_receive", "to_pay")
PINCODE_LENGTH = 6
EMAIL_MAX = 254
NOTES_MAX = 500
DISPLAY_CODE_MAX = 24
NAME_MAX = 160
#: EC-7 — an opening balance dated more than ten years back is a typo.
OPENING_MAX_YEARS_BACK = 10

COLUMNS = (
    ColumnSpec(
        "name",
        required=True,
        help="required; 2 to 160 characters",
        aliases=("party_name", "customer_name", "supplier_name", "party", "नाम"),
    ),
    ColumnSpec(
        "mobile",
        help="10-digit mobile; +91 is optional",
        aliases=("phone", "mobile_no", "mobile_number", "contact", "phone_number", "फ़ोन"),
    ),
    ColumnSpec(
        "type", help="customer, supplier or both (default customer)", aliases=("party_type",)
    ),
    ColumnSpec(
        "opening_balance",
        help="amount carried over from your old book, e.g. 2300.50",
        aliases=("balance", "outstanding", "opening", "opening_amount", "बाक़ी"),
        kind="money",
    ),
    ColumnSpec(
        "opening_type",
        help="to_receive (they owe you) or to_pay (you owe them)",
        aliases=("opening_direction", "balance_type"),
    ),
    ColumnSpec(
        "opening_date",
        help="dd/mm/yyyy; blank means the start of this financial year",
        aliases=("opening_as_of", "as_of", "balance_date"),
        kind="date",
    ),
    ColumnSpec("gstin", help="15 characters", aliases=("gst", "gst_no", "gst_number")),
    ColumnSpec("state", help="state name or 2-digit GST code", aliases=("state_code",)),
    ColumnSpec("address_line1", help="text", aliases=("address", "address_1", "address1")),
    ColumnSpec("address_line2", help="text", aliases=("address_2", "address2")),
    ColumnSpec("city", help="text", aliases=("town",)),
    ColumnSpec("pincode", help="6 digits", aliases=("pin", "pin_code", "zip")),
    ColumnSpec("email", help="email address"),
    ColumnSpec("alt_phone", help="another 10-digit number", aliases=("alternate_phone",)),
    ColumnSpec("credit_limit", help="amount, e.g. 50000", kind="money"),
    ColumnSpec("credit_days", help="whole number 0 to 365"),
    ColumnSpec("tags", help="up to 10, separated by ;", aliases=("area", "route", "tag")),
    ColumnSpec("notes", help="up to 500 characters", aliases=("note", "remarks")),
    ColumnSpec("display_code", help="your own code, up to 24 characters", aliases=("code",)),
)

TEMPLATE_ROWS = (
    {
        "name": "Ramesh Traders",
        "mobile": "9876543210",
        "type": "customer",
        "opening_balance": "2300.00",
        "opening_type": "to_receive",
        "opening_date": "01/04/2026",
        "state": "Maharashtra",
        "address_line1": "12 Station Road",
        "city": "Pune",
        "pincode": "411001",
        "credit_limit": "50000",
        "credit_days": "30",
        "tags": "Camp Area",
    },
    {
        "name": "Sharma Wholesale",
        "mobile": "9812345678",
        "type": "supplier",
        "opening_balance": "15000",
        "opening_type": "to_pay",
        "opening_date": "01/04/2026",
        "gstin": "27AAPFU0939F1ZV",
        "tags": "Suppliers",
    },
    {"name": "Walk-in Anil", "type": "customer"},
)


def _mobile_key(stored: str) -> str:
    """A stored party mobile in the spelling `coerce.mobile` produces, or as-is."""
    try:
        return coerce.mobile(stored) or stored
    except CoerceError:
        return stored


def preflight(tenant: Any) -> dict:
    """Everything a row needs to be judged without a query of its own (§20)."""
    from apps.common.dates import fy_bounds, tenant_today
    from apps.parties.models import Party, Tag

    today = tenant_today(tenant)
    # Keyed by the NORMALISED number. The party API accepts `9811100000` as
    # well as `+919811100000` and stores what it was sent, so a book written
    # partly by an API client holds both spellings; keyed by the raw value, a
    # sheet row (always E.164 after `coerce.mobile`) walked past the first
    # kind and created the same person twice — the partial unique index
    # cannot see it either, because the two strings differ.
    existing_mobiles = {
        _mobile_key(mobile): (str(pk), name)
        for pk, mobile, name in Party.objects.filter(tenant=tenant, mobile__isnull=False)
        .values_list("id", "mobile", "name")
        .iterator(chunk_size=2000)
    }
    existing_codes = {
        code.strip().lower()
        for code in Party.objects.filter(tenant=tenant, display_code__isnull=False)
        .values_list("display_code", flat=True)
        .iterator(chunk_size=2000)
        if code
    }
    tag_names = {
        name.lower() for name in Tag.objects.filter(tenant=tenant).values_list("name", flat=True)
    }
    return {
        "tenant": tenant,
        "today": today,
        "fy_start": fy_bounds(tenant, today)[0],
        "earliest_opening": today.replace(year=today.year - OPENING_MAX_YEARS_BACK),
        "mobiles": existing_mobiles,
        "codes": existing_codes,
        "tags": tag_names,
        "new_tags": set(),
        "opening_receivable": Decimal("0.00"),
        "opening_payable": Decimal("0.00"),
    }


def _state(raw: str) -> str | None:
    if coerce.is_blank(raw):
        return None
    value = coerce.text(raw)
    if value.isdigit():
        code = value.zfill(2)
        if code in STATE_NAMES:
            return code
    code = _STATE_BY_NAME.get(" ".join(value.lower().split()))
    if code is None:
        raise CoerceError("invalid_state", "We do not recognise this state.")
    return code


def _tags(raw: str) -> list[str]:
    from apps.parties.services.tags import MAX_TAGS_PER_PARTY, normalise_tag_name

    if coerce.is_blank(raw):
        return []
    names: list[str] = []
    seen: set[str] = set()
    for part in coerce.text(raw).split(";"):
        name = normalise_tag_name(part)
        if not name:
            continue
        if len(name) > 40 or "," in name:
            raise CoerceError("invalid_tags", "Up to 10 tags, each under 40 characters, split by ;")
        if name.lower() not in seen:
            seen.add(name.lower())
            names.append(name)
    if len(names) > MAX_TAGS_PER_PARTY:
        raise CoerceError("invalid_tags", "Up to 10 tags, each under 40 characters, split by ;")
    return names


def validate_row(ctx: dict, row: dict[str, str], number: int) -> RowResult:
    """PTY-10 §10's row rules, every field reported (a row may carry several)."""
    from apps.common.exceptions import ValidationFailed
    from apps.ledger.services.entries import validate_entry_payload
    from apps.parties.services.credit import MAX_CREDIT_LIMIT
    from apps.parties.services.crud import CREDIT_DAYS_MAX, NAME_MIN_LENGTH, _clean_text
    from apps.parties.services.tags import MAX_TAGS_PER_TENANT
    from apps.tax.validators import InvalidGstin, state_from_gstin, validate_gstin

    result = RowResult()
    clean: dict[str, Any] = {}

    def attempt(column: str, fn: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(row.get(column, ""), *args, **kwargs)
        except CoerceError as exc:
            result.error(column, exc.code, exc.message)
            return None

    # ── name ─────────────────────────────────────────────────────────────────
    name = _clean_text(coerce.text(row.get("name")))
    if len(name) < NAME_MIN_LENGTH or len(name) > NAME_MAX:
        result.error("name", "invalid_name", "Enter a name (2–160 characters).")
    clean["name"] = name

    # ── mobile: E.164 like everywhere else, and not already in the book ──────
    mobile = attempt("mobile", coerce.mobile)
    if mobile:
        holder = ctx["mobiles"].get(mobile)
        if holder is not None:
            result.error(
                "mobile",
                "duplicate_existing",
                f"Already in your book as {holder[1]} — remove this row or change the number.",
            )
        clean["mobile"] = mobile

    # ── type ─────────────────────────────────────────────────────────────────
    party_type = (
        attempt("type", coerce.choice, TYPE_CHOICES, message="Use customer, supplier or both.")
        or "customer"
    )
    clean["is_customer"] = party_type in ("customer", "both")
    clean["is_supplier"] = party_type in ("supplier", "both")

    # ── opening balance (LED-02's own rules, imported rather than restated) ──
    amount = attempt("opening_balance", coerce.money, maximum=MAX_CREDIT_LIMIT)
    opening_type = attempt(
        "opening_type", coerce.choice, OPENING_CHOICES, message="Use to_receive or to_pay."
    )
    as_of = attempt("opening_date", coerce.date_value, today=ctx["today"])
    if as_of is not None and as_of < ctx["earliest_opening"]:
        result.error(
            "opening_date",
            "invalid_date",
            "Use a date within the last ten years, not in the future.",
        )
        as_of = None
    if amount:
        direction = "credit" if opening_type == "to_pay" else "debit"
        as_of = as_of or ctx["fy_start"]
        try:
            validate_entry_payload(
                {"direction": direction, "amount": amount, "entry_date": as_of},
                tenant=ctx["tenant"],
                needs_mode=False,
            )
        except ValidationFailed as exc:
            details = getattr(exc, "details", {}) or {}
            column = "opening_date" if "entry_date" in details else "opening_balance"
            messages = details.get("entry_date") or details.get("amount") or ["Check this amount."]
            result.error(
                column,
                "invalid_amount" if column == "opening_balance" else "invalid_date",
                str(messages[0]),
            )
        else:
            clean["opening_balance_amount"] = amount
            clean["opening_balance_direction"] = direction
            clean["opening_balance_as_of"] = as_of
            if direction == "debit":
                ctx["opening_receivable"] += amount
            else:
                ctx["opening_payable"] += amount

    # ── GSTIN and state (PTY-01 FR-7: a mismatch warns, a bad checksum refuses)
    state = attempt("state", _state)
    raw_gstin = coerce.text(row.get("gstin")).upper().replace(" ", "")
    if raw_gstin and not coerce.is_blank(raw_gstin):
        try:
            gstin = validate_gstin(raw_gstin)
        except InvalidGstin:
            result.error(
                "gstin", "invalid_gstin", "Check the GSTIN — the last character does not match."
            )
        else:
            clean["gstin"] = gstin
            gstin_state = state_from_gstin(gstin)
            if state and state != gstin_state:
                result.warn(
                    "state", "gstin_state_mismatch", "The state differs from the GSTIN's state."
                )
            state = state or gstin_state
    if state:
        clean["state_code"] = state

    # ── address ──────────────────────────────────────────────────────────────
    address: dict[str, str] = {}
    for column, key in (("address_line1", "line1"), ("address_line2", "line2"), ("city", "city")):
        value = attempt(column, coerce.optional_text, max_length=120)
        if value:
            address[key] = value
    pincode = coerce.text(row.get("pincode"))
    if pincode and not coerce.is_blank(pincode):
        if len(pincode) != PINCODE_LENGTH or not pincode.isdigit() or pincode[0] == "0":
            result.error("pincode", "invalid_pincode", "Enter a 6-digit PIN code.")
        else:
            address["pincode"] = pincode
    if address:
        if state:
            address["state_code"] = state
        clean["billing_address"] = address

    # ── contact extras ───────────────────────────────────────────────────────
    email = attempt("email", coerce.optional_text, max_length=EMAIL_MAX)
    if email:
        if "@" not in email or "." not in email.rsplit("@", 1)[-1] or " " in email:
            result.error("email", "invalid_email", "Enter a valid email.")
        else:
            clean["email"] = email.lower()
    alt = attempt("alt_phone", coerce.mobile)
    if alt:
        clean["alt_phone"] = alt

    # ── credit ───────────────────────────────────────────────────────────────
    limit = attempt("credit_limit", coerce.money, maximum=MAX_CREDIT_LIMIT)
    if limit is not None:
        clean["credit_limit"] = limit
    raw_days = coerce.text(row.get("credit_days"))
    if raw_days and not coerce.is_blank(raw_days):
        if not raw_days.isdigit() or not 0 <= int(raw_days) <= CREDIT_DAYS_MAX:
            result.error("credit_days", "invalid_credit_days", "Enter days between 0 and 365.")
        else:
            clean["credit_days"] = int(raw_days)

    # ── tags (created as needed at commit, PTY-05 rules, ≤ 200 per tenant) ────
    tags = attempt("tags", _tags)
    if tags:
        fresh = {t.lower() for t in tags} - ctx["tags"] - ctx["new_tags"]
        if len(ctx["tags"]) + len(ctx["new_tags"]) + len(fresh) > MAX_TAGS_PER_TENANT:
            result.error("tags", "invalid_tags", f"You can have up to {MAX_TAGS_PER_TENANT} tags.")
        else:
            ctx["new_tags"] |= fresh
            clean["tags"] = tags

    # ── notes and code ───────────────────────────────────────────────────────
    notes = attempt("notes", coerce.optional_text, max_length=NOTES_MAX)
    if notes:
        clean["notes"] = notes
    code = attempt("display_code", coerce.optional_text, max_length=DISPLAY_CODE_MAX)
    if code:
        if code.lower() in ctx["codes"]:
            result.error("display_code", "duplicate_code", "This code is already used.")
        clean["display_code"] = code

    result.clean = clean
    result.preview = {
        "name": name,
        "mobile": mobile,
        "type": party_type,
        "opening_balance": (
            str(clean["opening_balance_amount"]) if "opening_balance_amount" in clean else None
        ),
        "opening_type": opening_type or ("to_receive" if amount else None),
        "opening_date": (
            clean["opening_balance_as_of"].isoformat() if "opening_balance_as_of" in clean else None
        ),
        "gstin": clean.get("gstin"),
        "state": state,
        "tags": tags or [],
    }
    return result


def commit_rows(ctx: dict, service_ctx: Any, rows: list[tuple[int, dict]], progress: Any) -> dict:
    """`create_party()` per row, in file order, inside the engine's transaction."""
    from apps.parties.services.crud import create_party

    created = 0
    openings = 0
    receivable = Decimal("0.00")
    payable = Decimal("0.00")
    for index, (_number, clean) in enumerate(rows, start=1):
        create_party(ctx=service_ctx, payload=dict(clean))
        created += 1
        if clean.get("opening_balance_amount"):
            openings += 1
            if clean["opening_balance_direction"] == "debit":
                receivable += clean["opening_balance_amount"]
            else:
                payable += clean["opening_balance_amount"]
        progress(index)
    return {
        "created_parties": created,
        "opening_entries": openings,
        "opening_receivable": str(receivable),
        "opening_payable": str(payable),
    }


def preview_totals(ctx: dict) -> dict:
    """PTY-10 FR-7 — the opening totals the owner checks against their own book."""
    return {
        "opening_receivable": str(ctx["opening_receivable"]),
        "opening_payable": str(ctx["opening_payable"]),
        "tags_created": len(ctx["new_tags"]),
    }


SPEC = register(
    ImporterSpec(
        kind="parties",
        label="imports.kind.parties",
        columns=COLUMNS,
        template_rows=TEMPLATE_ROWS,
        required_permissions=("parties.party.write", "ledger.entry.write"),
        read_permission="parties.party.read",
        preflight=preflight,
        validate_row=validate_row,
        commit_rows=commit_rows,
        unique_columns=("mobile", "display_code"),
        max_rows=10_000,
        modules=("parties", "ledger"),
        summary_fields=(
            "created_parties",
            "opening_entries",
            "opening_receivable",
            "opening_payable",
        ),
        records_route="/parties",
        totals=preview_totals,
    )
)
