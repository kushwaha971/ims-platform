"""The in-house QR encoder (SAL-03 FR-4, PAY-03; ADR-021 / Part 43 C3).

Three independent checks, because an encoder that is only tested against its
own output proves nothing: the Reed–Solomon codewords against ISO/IEC 18004's
worked example, the format and version bits against the standard's tables, and
the whole symbol decoded by OpenCV (skipped where OpenCV is absent — it is not
a project dependency and never will be).
"""

from __future__ import annotations

import pytest

from apps.common.qr import (
    choose_version,
    encode,
    format_bits,
    matrix_rows,
    rs_remainder,
    to_svg,
    version_bits,
)
from apps.common.upi import build_upi_url

UPI = (
    "upi://pay?pa=sharma@okhdfc&pn=Sharma%20General%20Store&am=1772.00&cu=INR"
    "&tn=INV%2F26-27%2F0042&tr=0192f3a4b5c6"
)


def test_reed_solomon_matches_the_standards_worked_example() -> None:
    """Protects: the GF(256) arithmetic and generator — ISO 18004 Annex I, 1-M "01234567"."""
    data = [0x10, 0x20, 0x0C, 0x56, 0x61, 0x80, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11,
            0xEC, 0x11]  # fmt: skip
    assert rs_remainder(data, 10) == [0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87, 0x2C, 0x55]


@pytest.mark.parametrize(
    "mask, expected",
    [
        (0, "101010000010010"),
        (1, "101000100100101"),
        (2, "101111001111100"),
        (3, "101101101001011"),
        (4, "100010111111001"),
        (5, "100000011001110"),
        (6, "100111110010111"),
        (7, "100101010100000"),
    ],
)
def test_format_bits_match_the_level_m_table(mask: int, expected: str) -> None:
    """Protects: the BCH(15,5) code and the 0x5412 mask for level M."""
    assert format(format_bits(mask), "015b") == expected


def test_version_bits_match_the_table() -> None:
    """Protects: the BCH(18,6) version information drawn from version 7 up."""
    assert [version_bits(v) for v in (7, 8, 9, 10)] == [0x07C94, 0x085BC, 0x09A99, 0x0A4D3]


def test_versions_grow_with_the_payload_and_stop_at_ten() -> None:
    """Protects: byte-mode capacity at level M (14 bytes fit v1, 15 do not)."""
    assert choose_version(b"x" * 14) == 1
    assert choose_version(b"x" * 15) == 2
    assert choose_version(b"x" * 213) == 10
    with pytest.raises(ValueError):
        choose_version(b"x" * 214)


def test_symbol_has_finders_timing_and_the_dark_module() -> None:
    """Protects: the function patterns a scanner locks onto first."""
    matrix = encode(UPI)
    size = len(matrix)
    assert size == 17 + 4 * choose_version(UPI.encode())
    for r0, c0 in ((0, 0), (0, size - 7), (size - 7, 0)):
        assert matrix[r0][c0 : c0 + 7] == [1] * 7
        assert matrix[r0 + 3][c0 + 2 : c0 + 5] == [1, 1, 1]
    assert [matrix[6][c] for c in range(8, 13)] == [1, 0, 1, 0, 1]
    assert matrix[size - 8][8] == 1
    assert all(set(row) <= {"0", "1"} for row in matrix_rows(matrix))
    assert to_svg(matrix).startswith("<svg") and 'fill="#000"' in to_svg(matrix)


@pytest.mark.parametrize("length", [5, 40, 106, 107, 150, 200, 213])
def test_an_independent_decoder_reads_every_mask_back(length: int) -> None:
    """Protects: the whole symbol — placement, interleaving, masks, version info (v1..v10).
    Decoded at three scales by both OpenCV detectors; a symbol that none can read fails."""
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    text = (UPI * 3)[:length]
    detectors = [cv2.QRCodeDetector()]
    if hasattr(cv2, "QRCodeDetectorAruco"):
        detectors.append(cv2.QRCodeDetectorAruco())
    for mask in range(8):
        grid = np.array(encode(text, mask=mask), dtype=np.uint8)
        image = (np.pad(1 - grid, 4, constant_values=1) * 255).astype(np.uint8)
        decoded = set()
        for scale in (6, 8, 10):
            big = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
            decoded |= {detector.detectAndDecode(big)[0] for detector in detectors}
        assert text in decoded, f"mask {mask} unreadable"


def test_upi_url_is_canonically_encoded() -> None:
    """T-SAL03-1 / AC-4 — space and & in pn encoded, am to two decimals, tn capped at 50."""
    from decimal import Decimal

    url = build_upi_url(pa="sharma@okhdfc", pn="Sharma & Sons Store", am=Decimal("1772"),
                        tn="INV/26-27/0042", tr="0192f3a4b5c6dead")  # fmt: skip
    assert url == (
        "upi://pay?pa=sharma@okhdfc&pn=Sharma%20%26%20Sons%20Store&am=1772.00&cu=INR"
        "&tn=INV%2F26-27%2F0042&tr=0192f3a4b5c6"
    )
    assert "am=" not in build_upi_url(pa="a@b", pn="X", am=Decimal("0"))
    assert len(build_upi_url(pa="a@bc", pn="X", tn="n" * 80).split("tn=")[1]) == 50
