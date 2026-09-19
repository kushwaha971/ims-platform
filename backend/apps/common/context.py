"""The service context object (Part 20 §20.3.2).

Services need three things from the caller that are not domain arguments: who is
acting, which tenant, and the request id. Passing `request` would couple services
to HTTP and break the "callable from a job" rule, so every service takes `ctx` as
its first keyword-only argument.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:  # pragma: no cover - typing only
    from apps.platform_app.models import Tenant, User

ActorType = Literal["user", "system", "webhook", "super_admin"]


@dataclass(frozen=True, slots=True)
class Ctx:
    """Everything a service needs about the caller, and nothing about HTTP.

    Built by `Ctx.from_request(request)` in views, by `Ctx.system(tenant)` in job
    handlers and management commands. Frozen so a service cannot mutate the
    caller's identity halfway through a transaction.
    """

    tenant: "Tenant"
    actor: "User | None" = None
    actor_type: ActorType = "user"
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ip: str | None = None
    user_agent: str | None = None
    idempotency_key: str | None = None
    audit_meta: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_request(cls, request: Any) -> "Ctx":
        from apps.common.tenancy import get_effective_tenant

        tenant = get_effective_tenant(request)
        if tenant is None:  # fail closed — never a service call without a tenant
            raise RuntimeError("Ctx.from_request called without a resolved tenant")
        user = getattr(request, "user", None)
        authenticated = bool(user is not None and getattr(user, "is_authenticated", False))
        return cls(
            tenant=tenant,
            actor=user if authenticated else None,
            actor_type="super_admin" if getattr(user, "is_super_admin", False) else "user",
            request_id=getattr(request, "request_id", None) or str(uuid.uuid4()),
            ip=getattr(request, "client_ip", None),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:255] or None),
            idempotency_key=request.headers.get("Idempotency-Key"),
        )

    @classmethod
    def system(cls, tenant: "Tenant", *, request_id: str | None = None, **audit_meta: Any) -> "Ctx":
        return cls(
            tenant=tenant,
            actor=None,
            actor_type="system",
            request_id=request_id or str(uuid.uuid4()),
            audit_meta=audit_meta,
        )
