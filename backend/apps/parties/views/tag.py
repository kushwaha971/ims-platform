"""`/parties/tags` — PTY-05's CRUD, merge and bulk assignment.

Thin (Part 26 §26.7 R7.1): authenticate, authorise, delegate to one service,
wrap the result. Every rule about names, casing, limits and merging lives in
`parties/services/tags.py`, where a CSV import and a management command can
reach it too.
"""

from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.viewsets import TenantScopedViewSet
from apps.parties.models import Tag
from apps.parties.serializers.tag import (
    BulkTagResultSerializer,
    BulkTagSerializer,
    TagMergeSerializer,
    TagSerializer,
    TagWriteSerializer,
)
from apps.parties.services.tags import (
    bulk_tag,
    delete_tag,
    get_or_create_tag,
    merge_tags,
    tags_for_tenant,
    update_tag,
)

#: §12 — tags introduce NO new codenames. Reading and filtering is the party
#: read right; assigning and creating is the party write right; deleting a tag
#: is the party delete right, because a delete changes what every other user in
#: the business sees.
TagPermissions = HasPermission(
    {
        "list": "parties.party.read",
        "retrieve": "parties.party.read",
        "create": "parties.party.write",
        "update": "parties.party.write",
        "partial_update": "parties.party.write",
        "merge": "parties.party.write",
        "bulk_tag": "parties.party.write",
        "destroy": "parties.party.delete",
    }
)


class TagViewSet(TenantScopedViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.PARTIES),
        TagPermissions,
    ]
    # No pagination: the tenant ceiling is 200 tags, which is one small
    # response, and the picker wants all of them at once so that opening it
    # twice does not cost two round trips.
    pagination_class = None

    def get_queryset(self) -> Any:
        include_archived = self.request.query_params.get("include_archived") == "true"
        return tags_for_tenant(tenant=self.get_tenant(), include_archived=include_archived)

    def _ctx(self, request: Any) -> Ctx:
        return Ctx(
            tenant=self.get_tenant(),
            actor=request.user,
            actor_type="user",
            request_id=getattr(request, "request_id", "") or "",
            ip=getattr(request, "client_ip", None),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        )

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        queryset = self.get_queryset()
        query = (request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(name__icontains=query)
        data = TagSerializer(queryset, many=True).data
        return StandardResponse.ok(data, meta={"total": len(data)})

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """201 for a new tag, 200 for one that already existed (FR-3).

        An idempotent create, because creating a tag is a convenience rather
        than a transaction: a merchant typing "Camp Area" into two party forms
        wants the tag, not an error about having asked twice. The two statuses
        let a client tell which happened without either being a failure.
        """
        serializer = TagWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data.get("name", "")
        tag, created = get_or_create_tag(
            ctx=self._ctx(request),
            name=name,
            color=serializer.validated_data.get("color"),
        )
        payload = TagSerializer(tag).data
        return StandardResponse.created(payload) if created else StandardResponse.ok(payload)

    def update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tag = self.get_object()
        serializer = TagWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_tag(
            ctx=self._ctx(request),
            tag=tag,
            name=serializer.validated_data.get("name"),
            color=serializer.validated_data.get("color", ...),
        )
        return StandardResponse.ok(TagSerializer(updated).data)

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return self.update(request, *args, **kwargs)

    def destroy(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """204, or 200 with the count when asked to rehearse.

        `?dry_run=true` is what the confirm dialog calls so it can say "it will
        be removed from 34 parties" — the number has to be the server's, and
        asking for it must not be a second way to delete something.
        """
        tag = self.get_object()
        if request.query_params.get("dry_run") == "true":
            from apps.parties.services.tags import live_party_count

            # The SAME count the manager's row shows (BR-9), so the row and the
            # confirmation two clicks later cannot disagree about the same tag.
            return StandardResponse.ok({"party_count": live_party_count(tag)})
        delete_tag(ctx=self._ctx(request), tag=tag)
        return StandardResponse.no_content()

    @action(detail=True, methods=["post"])
    def merge(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        source = self.get_object()
        serializer = TagMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = get_object_or_404(
            Tag.objects.for_tenant(self.get_tenant()),
            pk=serializer.validated_data["into_tag_id"],
        )
        result = merge_tags(ctx=self._ctx(request), source=source, into=target)
        return StandardResponse.ok(TagSerializer(target).data, meta=result)

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_tag(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = BulkTagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = bulk_tag(
            ctx=self._ctx(request),
            party_ids=serializer.validated_data["party_ids"],
            tag_names=serializer.validated_data["tag_names"],
            mode=serializer.validated_data["mode"],
        )
        return StandardResponse.ok(BulkTagResultSerializer(result).data)
