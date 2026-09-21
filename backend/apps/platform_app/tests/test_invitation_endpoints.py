"""The HTTP layer of PLT-05 invitations — `GET`/`POST /invitations`, `DELETE /invitations/{id}`.

`services.memberships.invite` and `revoke_invitation` are already pinned by
`test_invitations.py`; these tests are about the three things only the endpoint
can get wrong — who may call it, which tenant's rows it can reach, and what
leaves the process in the response body.

The one that would be expensive to discover late is the last: the raw token is
created once and stored nowhere, so every path that could copy it out — the
list, the detail, the idempotency replay row — is asserted against by name here
rather than trusted.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.apps import apps as django_apps
from django.urls import reverse
from django.utils import timezone

from apps.platform_app.constants import InvitationStatus
from apps.platform_app.models import Invitation
from apps.platform_app.tokens import hash_token
from tests.factories.platform import InvitationFactory

LIST_URL = "v1:invitation-list"
DETAIL_URL = "v1:invitation-detail"


def _detail(invitation_id: Any) -> str:
    return reverse(DETAIL_URL, kwargs={"invitation_id": str(invitation_id)})


def _create(client: Any, **overrides: Any) -> Any:
    body = {"email": "priya@shop.test", "role": "staff", "mobile": None, **overrides}
    return client.post(reverse(LIST_URL), body, format="json")


def _token_of(response: Any) -> str:
    """The raw token out of `accept_url`, the way the invitee's browser would."""
    return response.json()["data"]["accept_url"].rsplit("/", 1)[1]


# ── Creating ─────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_creating_an_invitation_returns_the_row_and_the_only_copy_of_the_link(
    api_as: Any, tenant: Any, settings: Any
) -> None:
    """201 carries the invitation plus `accept_url`, and the link is a real one.

    The link is built from `UB_PUBLIC_BASE_URL` and the raw token, and the raw
    token exists only in `invite()`'s return value — so if the view ever forgets
    to attach it, or attaches something that is not the token, nothing else in
    the system can tell, because the stored `token_hash` cannot be reversed.
    """
    client, member = api_as(tenant)

    response = _create(client)

    assert response.status_code == 201, response.content
    data = response.json()["data"]
    assert set(data) == {
        "id",
        "email",
        "role",
        "status",
        "expires_at",
        "created_at",
        "invited_by",
        "accept_url",
    }
    assert data["email"] == "priya@shop.test"
    assert data["role"] == "staff"
    assert data["status"] == InvitationStatus.PENDING
    assert data["invited_by"] == member.user.full_name
    assert data["accept_url"].startswith(f"{settings.UB_PUBLIC_BASE_URL}/accept-invite/")

    invitation = Invitation.objects.get(pk=data["id"])
    assert invitation.tenant_id == tenant.id
    assert invitation.token_hash == hash_token(_token_of(response))
    assert invitation.invited_by_id == member.user.id


@pytest.mark.django_db
def test_the_link_it_returns_is_one_the_accept_endpoint_takes(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    """Drive the endpoint's own output into the endpoint that consumes it.

    The two halves were written a sprint apart against the same model, which is
    exactly where a URL is built in one shape and parsed in another. Asserting
    that `accept_url` merely *looks* like a link would not catch a trailing
    slash, an escaped token or a query-string-versus-path mix-up; accepting the
    invitation with it does.
    """
    from apps.platform_app.models import Membership

    inviter, _ = api_as(tenant)
    invitee, invitee_member = api_as(other_tenant)

    created = _create(inviter, email=invitee_member.user.email)
    assert created.status_code == 201, created.content

    accepted = invitee.post(
        reverse("v1:invitation-accept", kwargs={"token": _token_of(created)}), {}, format="json"
    )

    assert accepted.status_code == 200, accepted.content
    joined = Membership.objects.get(user=invitee_member.user, tenant=tenant)
    assert (joined.status, joined.role.code) == ("active", "staff")


@pytest.mark.django_db
def test_an_unknown_role_code_is_a_validation_error_not_a_server_error(
    api_as: Any, tenant: Any
) -> None:
    """A typo in a client is a bad field. Letting the lookup raise would be a 500.

    The wire carries a role *code* and the service takes a `Role` row; the
    resolution between them is the view's job, and `Role.objects.get(code=...)`
    on an unknown code raises `DoesNotExist`, which the handler can only render
    as `server_error`. The caller would then see "something went wrong" and
    retry the same unfixable body.
    """
    client, _ = api_as(tenant)

    response = _create(client, role="stafff")

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "role" in body["error"]["details"]
    assert not Invitation.objects.filter(tenant=tenant).exists()


@pytest.mark.django_db
def test_a_malformed_mobile_is_a_validation_error_not_a_database_error(
    api_as: Any, tenant: Any
) -> None:
    """`platform_invitation.mobile` is 15 characters; an unvalidated one is a 500.

    `mobile` is a notification channel since DEC-010, not the identity, so it is
    easy to treat as free text — but Postgres does not, and an over-long value
    reaches it as a `DataError` rather than a field message the merchant can act
    on.
    """
    client, _ = api_as(tenant)

    response = _create(client, mobile="not a phone number at all")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_a_mobile_is_optional_and_normalised_when_given(api_as: Any, tenant: Any) -> None:
    client, _ = api_as(tenant)

    with_number = _create(client, email="a@shop.test", mobile="98765 43210")
    without = _create(client, email="b@shop.test", mobile=None)

    assert with_number.status_code == 201, with_number.content
    assert without.status_code == 201, without.content
    assert Invitation.objects.get(email="a@shop.test").mobile == "+919876543210"
    assert Invitation.objects.get(email="b@shop.test").mobile is None


@pytest.mark.django_db
def test_re_inviting_the_same_address_supersedes_rather_than_duplicating(
    api_as: Any, tenant: Any
) -> None:
    """Through HTTP, because the list is what the owner then reads.

    The service revokes the earlier row; the endpoint has to leave the list
    showing one live invitation, not two, or the team screen offers the owner a
    link that no longer works beside one that does.
    """
    client, _ = api_as(tenant)

    first = _create(client)
    second = _create(client)

    assert first.json()["data"]["id"] != second.json()["data"]["id"]
    listed = client.get(reverse(LIST_URL)).json()["data"]
    assert [row["id"] for row in listed] == [second.json()["data"]["id"]]
    assert Invitation.objects.get(pk=first.json()["data"]["id"]).status == InvitationStatus.REVOKED


# ── Listing ──────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_the_list_is_this_tenant_pending_newest_first(
    api_as: Any, tenant: Any, system_roles: dict
) -> None:
    """Default filter, ordering and scope in one, because all three are defaults.

    Newest first because the owner's question is "did that invitation go out",
    and pending-only because a tenant that has re-invited somebody three times
    would otherwise have to read past three revoked rows to find the live one.
    """
    older = InvitationFactory(
        tenant=tenant, role=system_roles["staff"], email="older@shop.test", raw_token="tok-older"
    )
    newer = InvitationFactory(
        tenant=tenant, role=system_roles["staff"], email="newer@shop.test", raw_token="tok-newer"
    )
    InvitationFactory(
        tenant=tenant,
        role=system_roles["staff"],
        email="gone@shop.test",
        raw_token="tok-gone",
        status=InvitationStatus.REVOKED,
    )
    Invitation.objects.filter(pk=older.pk).update(
        created_at=timezone.now() - timezone.timedelta(hours=1)
    )

    client, _ = api_as(tenant)
    response = client.get(reverse(LIST_URL))

    assert response.status_code == 200, response.content
    body = response.json()
    assert [row["id"] for row in body["data"]] == [str(newer.id), str(older.id)]
    assert body["meta"]["total"] == 2
    assert set(body["data"][0]) == {
        "id",
        "email",
        "role",
        "status",
        "expires_at",
        "created_at",
        "invited_by",
    }


@pytest.mark.django_db
def test_the_list_can_be_asked_for_another_status(
    api_as: Any, tenant: Any, system_roles: dict
) -> None:
    """`?status=` is how "what happened to it" is answered. `all` means no filter."""
    InvitationFactory(
        tenant=tenant, role=system_roles["staff"], email="live@shop.test", raw_token="tok-live"
    )
    InvitationFactory(
        tenant=tenant,
        role=system_roles["staff"],
        email="dead@shop.test",
        raw_token="tok-dead",
        status=InvitationStatus.REVOKED,
    )
    client, _ = api_as(tenant)

    revoked = client.get(reverse(LIST_URL), {"status": "revoked"}).json()["data"]
    everything = client.get(reverse(LIST_URL), {"status": "all"}).json()["data"]

    assert [row["email"] for row in revoked] == ["dead@shop.test"]
    assert {row["email"] for row in everything} == {"live@shop.test", "dead@shop.test"}


@pytest.mark.django_db
def test_an_unknown_status_filter_is_refused_rather_than_answered_with_nothing(
    api_as: Any, tenant: Any
) -> None:
    """`?status=pendingg` must not look like "you have invited nobody".

    An unvalidated filter passed straight to the queryset returns an empty list,
    and an empty list is indistinguishable from the truth — so a typo in a
    client reads as data loss to the merchant looking at the screen.
    """
    client, _ = api_as(tenant)

    response = client.get(reverse(LIST_URL), {"status": "pendingg"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_no_response_ever_carries_the_token_or_its_hash(api_as: Any, tenant: Any) -> None:
    """The list and the detail are the two places a token could leak by accident.

    `token_hash` is a column on the model, so a `ModelSerializer` declared with
    `__all__` — or extended later without thinking — publishes it, and a hash an
    attacker holds is a hash they can compare against a guessed token. The raw
    token is worse: it is a live seat. Both are asserted absent from the whole
    serialized body, not from a field list, so a future field cannot smuggle one
    back in.
    """
    client, _ = api_as(tenant)
    created = _create(client)
    raw_token = _token_of(created)
    token_hash = Invitation.objects.get(tenant=tenant).token_hash

    listed = client.get(reverse(LIST_URL), {"status": "all"}).content.decode()

    assert raw_token not in listed
    assert token_hash not in listed
    assert "token" not in listed
    # …and the create response carries the token exactly once, in `accept_url`.
    assert token_hash not in created.content.decode()


# ── Revoking ─────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_revoking_answers_204_and_closes_the_link(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    inviter, _ = api_as(tenant)
    invitee, invitee_member = api_as(other_tenant)
    created = _create(inviter, email=invitee_member.user.email)
    invitation_id = created.json()["data"]["id"]

    revoked = inviter.delete(_detail(invitation_id))

    assert revoked.status_code == 204
    assert revoked.content == b""
    assert Invitation.objects.get(pk=invitation_id).status == InvitationStatus.REVOKED
    # The link the invitee already holds now fails, which is the whole point.
    attempted = invitee.post(
        reverse("v1:invitation-accept", kwargs={"token": _token_of(created)}), {}, format="json"
    )
    assert attempted.status_code == 400
    assert attempted.json()["error"]["code"] == "invitation_invalid"


@pytest.mark.django_db
def test_revoking_something_already_dealt_with_is_not_an_error(
    api_as: Any, tenant: Any, system_roles: dict
) -> None:
    """A second DELETE, or one on an accepted row, is still 204.

    The caller asked for that link not to work and it does not work; there is
    nothing to report. Answering 409 here would make the team screen's retry
    after a dropped response look like a failure the owner has to understand.
    """
    accepted = InvitationFactory(
        tenant=tenant,
        role=system_roles["staff"],
        raw_token="tok-accepted",
        status=InvitationStatus.ACCEPTED,
    )
    client, _ = api_as(tenant)
    created = _create(client)

    assert client.delete(_detail(created.json()["data"]["id"])).status_code == 204
    assert client.delete(_detail(created.json()["data"]["id"])).status_code == 204
    assert client.delete(_detail(accepted.id)).status_code == 204
    # Revoking does not rewrite history: an accepted invitation stays accepted.
    assert Invitation.objects.get(pk=accepted.pk).status == InvitationStatus.ACCEPTED


@pytest.mark.django_db
def test_an_invitation_that_does_not_exist_is_404(api_as: Any, tenant: Any) -> None:
    client, _ = api_as(tenant)

    response = client.delete(_detail("0199c0a0-0000-7000-8000-00000000dead"))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ── Tenancy and permission ───────────────────────────────────────────────────


@pytest.mark.django_db
def test_another_tenants_invitations_are_not_in_the_list(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """Fail-closed scoping, asserted from the outside (canon §0.11 rule 2).

    `invitations_of` filters on the tenant first, so an unscoped queryset is the
    defect this pins: it would show one business the addresses of everyone
    another business is hiring.
    """
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email="theirs@shop.test",
        raw_token="tok-theirs",
    )
    mine = InvitationFactory(
        tenant=tenant, role=system_roles["staff"], email="mine@shop.test", raw_token="tok-mine"
    )
    client, _ = api_as(tenant)

    body = client.get(reverse(LIST_URL), {"status": "all"}).json()

    assert [row["id"] for row in body["data"]] == [str(mine.id)]
    assert body["meta"]["total"] == 1


@pytest.mark.django_db
def test_revoking_another_tenants_invitation_is_404_and_never_403(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """Canon §0.11 rule 2: a cross-tenant id answers 404, not 403.

    403 is the tempting answer — the caller genuinely may not touch this row —
    and it is the wrong one, because it confirms the row exists. An owner could
    then probe ids and learn that a competitor is hiring. The id is matched
    inside the tenant filter so the two cases are indistinguishable by
    construction rather than by a branch somebody can forget.
    """
    theirs = InvitationFactory(
        tenant=other_tenant, role=system_roles["staff"], raw_token="tok-not-mine"
    )
    client, _ = api_as(tenant)

    response = client.delete(_detail(theirs.id))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert Invitation.objects.get(pk=theirs.pk).status == InvitationStatus.PENDING


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["staff", "accountant"])
def test_a_role_without_members_manage_may_not_read_or_write_invitations(
    api_as: Any, tenant: Any, system_roles: dict, role: str
) -> None:
    """Canon §0.9 gives `platform.members.manage` to owner and admin only.

    The list is gated as tightly as the create deliberately: it names people who
    are not members yet, and who the owner is hiring is not something a staff
    member is entitled to read.
    """
    theirs = InvitationFactory(tenant=tenant, role=system_roles["staff"], raw_token="tok-gated")
    client, _ = api_as(tenant, role=role)

    listed = client.get(reverse(LIST_URL))
    created = _create(client, email="someone@shop.test")
    revoked = client.delete(_detail(theirs.id))

    assert [listed.status_code, created.status_code, revoked.status_code] == [403, 403, 403]
    assert listed.json()["error"]["code"] == "permission_denied"
    assert Invitation.objects.filter(tenant=tenant).count() == 1
    assert Invitation.objects.get(pk=theirs.pk).status == InvitationStatus.PENDING


@pytest.mark.django_db
def test_an_anonymous_caller_is_refused(anonymous_client: Any, tenant: Any) -> None:
    assert anonymous_client.get(reverse(LIST_URL)).status_code == 401
    assert _create(anonymous_client).status_code == 401


@pytest.mark.django_db
def test_an_admin_may_manage_invitations(api_as: Any, tenant: Any) -> None:
    """The other half of the matrix — the permission is not owner-only."""
    client, _ = api_as(tenant, role="admin")

    created = _create(client)

    assert created.status_code == 201, created.content
    assert client.delete(_detail(created.json()["data"]["id"])).status_code == 204


# ── Idempotency ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_replaying_the_create_does_not_send_a_second_invitation(api_as: Any, tenant: Any) -> None:
    """The retry EC-7 tells a client to make must not kill the link it already sent.

    Re-inviting the same address supersedes the earlier invitation, so without
    the key a retry after a lost response would revoke the token the first
    attempt already delivered and the invitee would click a dead link. The
    replay is the same 201 for the same row, and no second row exists.
    """
    client, _ = api_as(tenant)
    headers = {"HTTP_IDEMPOTENCY_KEY": "invite-priya-once"}

    first = client.post(
        reverse(LIST_URL), {"email": "priya@shop.test", "role": "staff"}, format="json", **headers
    )
    second = client.post(
        reverse(LIST_URL), {"email": "priya@shop.test", "role": "staff"}, format="json", **headers
    )

    assert first.status_code == 201, first.content
    assert second.status_code == 201, second.content
    assert second["Idempotent-Replayed"] == "true"
    assert second.json()["data"]["id"] == first.json()["data"]["id"]
    assert Invitation.objects.filter(tenant=tenant).count() == 1


@pytest.mark.django_db
def test_the_replay_row_does_not_keep_the_raw_token(api_as: Any, tenant: Any) -> None:
    """A stored 201 body would put a live seat in a table, for a day, in plaintext.

    `invite()` keeps the raw token out of the audit log because "an audit row a
    support engineer can read is an audit row that hands them a live seat"; the
    idempotency row is the same table with the same readers, so the decorator's
    stored body is redacted through `idempotent_response_body`. The replay is
    therefore the invitation with `accept_url: null` — the token exists once, in
    one response, and a caller who lost it revokes and re-invites.
    """
    client, _ = api_as(tenant)
    headers = {"HTTP_IDEMPOTENCY_KEY": "invite-priya-secret"}
    first = client.post(
        reverse(LIST_URL), {"email": "priya@shop.test", "role": "staff"}, format="json", **headers
    )
    raw_token = _token_of(first)

    record = django_apps.get_model("platform", "IdempotencyKey").objects.get(
        scope="invitation_create"
    )
    second = client.post(
        reverse(LIST_URL), {"email": "priya@shop.test", "role": "staff"}, format="json", **headers
    )

    assert raw_token not in str(record.response_body)
    assert record.response_body["data"]["accept_url"] is None
    assert second.json()["data"]["accept_url"] is None
    # The invitation itself still replays, so the retry is not a dead end.
    assert second.json()["data"]["id"] == first.json()["data"]["id"]


@pytest.mark.django_db
def test_a_rejected_create_does_not_burn_the_key(api_as: Any, tenant: Any) -> None:
    """The merchant fixes the role and retries from the same screen, same key."""
    client, _ = api_as(tenant)
    headers = {"HTTP_IDEMPOTENCY_KEY": "invite-after-typo"}

    rejected = client.post(
        reverse(LIST_URL), {"email": "priya@shop.test", "role": "stafff"}, format="json", **headers
    )
    corrected = client.post(
        reverse(LIST_URL), {"email": "priya@shop.test", "role": "staff"}, format="json", **headers
    )

    assert rejected.status_code == 400
    assert corrected.status_code == 201, corrected.content
