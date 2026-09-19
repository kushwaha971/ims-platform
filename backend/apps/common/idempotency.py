"""The idempotency service (Part 20 §20.6.5, Part 22 §22.1).

Storage is `platform_idempotency_key`, owned by the `platform` app. The unique
index on `(tenant, scope, key)` *is* the lock: two concurrent identical requests
cannot both execute.
"""

from __future__ import annotations

import functools
import hashlib
import json
from datetime import timedelta
from decimal import Decimal
from typing import Any, Callable

from django.apps import apps
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.response import Response

from apps.common.constants import IdempotencyStatus
from apps.common.exceptions import IdempotencyConflict, IdempotencyInProgress

KEY_TTL_HOURS = 24
KEY_MAX_LENGTH = 64


def _idempotency_model() -> Any:
    """Lazy model lookup — rule D1 forbids a module-level `apps.*` import."""
    return apps.get_model("platform", "IdempotencyKey")


def canonical_json(value: Any) -> str:
    """Stable JSON: sorted keys, no whitespace, `Decimal` as string."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=_default)


def _default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def request_hash(*, method: str, path: str, body: Any) -> str:
    """`sha256(canonical_json(body) + method + path)` (Part 21 §21.3.1)."""
    material = f"{canonical_json(body)}|{method.upper()}|{path}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def idempotent(scope: str, *, keyed_by: str = "tenant") -> Callable:
    """View decorator implementing Part 22 §22.1 idempotency exactly.

    No key present                → execute normally (the header is required only
                                    where the FRD says so; the decorator does not
                                    invent a requirement).
    Key + same body + completed   → replay the stored response, with
                                    `Idempotent-Replayed: true`.
    Key + same body + in_progress → 409 `idempotency_in_progress`.
    Key + different body          → 409 `idempotency_conflict`.

    `keyed_by` picks which unique index holds the lock:

    ``"tenant"`` (the default)
        The row is `(tenant, scope, key)` — one namespace per business, which is
        what every tenant-scoped write wants.

    ``"user"``
        The row is `(NULL, user, scope, key)`. This is for endpoints that
        *create or change the caller's tenant*. Keying those by tenant is a
        contradiction: the first attempt of `POST /tenants` runs under tenant A
        (or under none) and its response moves the caller's `tid` to the new
        tenant B, so the retry arrives under B, lands on a different tuple, is
        treated as a fresh claim, and creates a *second business*. The key's
        namespace must not depend on state the request itself mutates — PLT-03
        EC-7 is exactly the case where it does.

    **A replay must be a whole response, not a body.** The stored
    `response_body` is replayed verbatim, but a response's side effects can live
    in its headers — `POST /tenants` issues the session cookies carrying the new
    `tid` there, and a replay without them hands the client a 201 for a tenant
    it holds no token for, which wedges the next wizard step on
    `no_active_tenant`. A view whose response carries such side effects declares
    an `idempotent_replay(request, record, response)` method; the decorator
    calls it on the replay path and returns what it returns.
    """
    if keyed_by not in ("tenant", "user"):  # pragma: no cover - programming error
        raise ValueError(f"keyed_by must be 'tenant' or 'user', not {keyed_by!r}")

    def decorator(view_method: Callable) -> Callable:
        @functools.wraps(view_method)
        def wrapper(self: Any, request: Any, *args: Any, **kwargs: Any) -> Any:
            key = request.headers.get("Idempotency-Key")
            if not key:
                return view_method(self, request, *args, **kwargs)

            from apps.common.tenancy import get_effective_tenant

            tenant = None if keyed_by == "user" else get_effective_tenant(request)
            model = _idempotency_model()
            key = key[:KEY_MAX_LENGTH]
            digest = request_hash(
                method=request.method, path=request.path, body=getattr(request, "data", None)
            )

            user = request.user if request.user.is_authenticated else None
            # `POST /tenants` presents a key before a tenant exists (PLT-03
            # EC-7). The tenant-less case is scoped to the user by its own
            # partial unique index, so the lookup below has to match whichever
            # index actually holds the lock.
            lookup = (
                {"tenant": tenant, "scope": scope, "key": key}
                if tenant is not None
                else {"tenant__isnull": True, "user": user, "scope": scope, "key": key}
            )

            # Claim the key with an INSERT. The unique index is the lock.
            try:
                with transaction.atomic():
                    record = model.objects.create(
                        tenant=tenant,
                        user=user,
                        key=key,
                        scope=scope,
                        request_hash=digest,
                        status=IdempotencyStatus.IN_PROGRESS,
                        expires_at=timezone.now() + timedelta(hours=KEY_TTL_HOURS),
                    )
                claimed = True
            except IntegrityError:
                record = model.objects.get(**lookup)
                claimed = False

            if not claimed:
                if record.request_hash != digest:
                    raise IdempotencyConflict()
                if record.status == IdempotencyStatus.IN_PROGRESS:
                    raise IdempotencyInProgress()
                replay = Response(record.response_body, status=record.response_status)
                replay["Idempotent-Replayed"] = "true"
                rebuild = getattr(self, "idempotent_replay", None)
                if rebuild is not None:
                    replay = rebuild(request, record, replay)
                return replay

            try:
                response = view_method(self, request, *args, **kwargs)
            except Exception:
                # A view that raises — a serializer rejection, a business rule,
                # anything — must not burn the key. Without this the row stays
                # `in_progress` forever and the user's corrected retry is met
                # with 409 instead of the fix they just made. The same reasoning
                # as the non-2xx branch below, for the path that does not
                # produce a response object at all.
                model.objects.filter(pk=record.pk).delete()
                raise
            if 200 <= response.status_code < 300:
                model.objects.filter(pk=record.pk).update(
                    status=IdempotencyStatus.COMPLETED,
                    response_status=response.status_code,
                    response_body=json.loads(canonical_json(response.data)),
                    entity_id=_entity_id_of(response),
                    completed_at=timezone.now(),
                )
            else:
                # A failed attempt must not burn the key: the user will fix the
                # input and retry with the same key from the same UI state.
                model.objects.filter(pk=record.pk).delete()
            return response

        return wrapper

    return decorator


def _entity_id_of(response: Any) -> Any:
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        inner = data.get("data")
        if isinstance(inner, dict) and inner.get("id"):
            return inner["id"]
        if data.get("id"):
            return data["id"]
    return None


def purge_expired(*, now: Any = None) -> int:
    """Delete expired keys. Called hourly by `platform.purge_idempotency_keys`."""
    deleted, _ = _idempotency_model().objects.filter(expires_at__lt=now or timezone.now()).delete()
    return deleted
