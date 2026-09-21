"""Read-only party queries."""

from apps.parties.selectors.party import get_party, list_parties, party_detail_queryset

__all__ = ["get_party", "list_parties", "party_detail_queryset"]
