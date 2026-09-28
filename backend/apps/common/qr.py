"""A small QR Code encoder — byte mode, error-correction level M, versions 1–10.

ADR-021 keeps the dependency list closed and Part 43 C3 asked "in-house encoder
or `segno`?"; the answer taken for SAL-03/PAY-03 is in-house, because a UPI
payment URL is the only thing the product encodes and it needs a tenth of a
general encoder: one mode (byte), one level (M, ~15 % recovery — enough for a
receipt that gets folded), and versions up to 10 (up to 213 bytes; a UPI URL
with a long shop name is about 150).

Everything follows ISO/IEC 18004: Reed–Solomon over GF(256) with the 0x11D
polynomial, block interleaving, the eight masks with the four penalty rules,
BCH-coded format and version information. Tests check the RS encoder against
the standard's own worked codewords, the format bits against its table, and
the whole symbol by decoding it with an independent decoder where one is
installed.
"""

from __future__ import annotations

from typing import Iterable

# (data codewords per block list, EC codewords per block) for level M, v1..v10.
_BLOCKS_M: dict[int, tuple[tuple[int, ...], int]] = {
    1: ((16,), 10),
    2: ((28,), 16),
    3: ((44,), 26),
    4: ((32, 32), 18),
    5: ((43, 43), 24),
    6: ((27, 27, 27, 27), 16),
    7: ((31, 31, 31, 31), 18),
    8: ((38, 38, 39, 39), 22),
    9: ((36, 36, 36, 37, 37), 22),
    10: ((43, 43, 43, 43, 44), 26),
}
_ALIGN: dict[int, tuple[int, ...]] = {
    1: (),
    2: (6, 18),
    3: (6, 22),
    4: (6, 26),
    5: (6, 30),
    6: (6, 34),
    7: (6, 22, 38),
    8: (6, 24, 42),
    9: (6, 26, 46),
    10: (6, 28, 50),
}
MAX_VERSION = 10
_EC_LEVEL_M_BITS = 0b00

# ── GF(256) ──────────────────────────────────────────────────────────────────
_EXP = [0] * 512
_LOG = [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i] = _x
    _LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _EXP[_i] = _EXP[_i - 255]


def _gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _EXP[_LOG[a] + _LOG[b]]


def _generator(degree: int) -> list[int]:
    poly = [1]
    for i in range(degree):
        nxt = [0] * (len(poly) + 1)
        for j, coef in enumerate(poly):
            nxt[j] ^= coef
            nxt[j + 1] ^= _gf_mul(coef, _EXP[i])
        poly = nxt
    return poly


def rs_remainder(data: Iterable[int], degree: int) -> list[int]:
    """The `degree` Reed–Solomon EC codewords for `data` (polynomial division)."""
    gen = _generator(degree)
    rem = [0] * degree
    for byte in data:
        factor = byte ^ rem[0]
        rem = rem[1:] + [0]
        for k in range(degree):
            rem[k] ^= _gf_mul(gen[k + 1], factor)
    return rem


# ── Data encoding ────────────────────────────────────────────────────────────
def _capacity(version: int) -> int:
    return sum(_BLOCKS_M[version][0])


def choose_version(payload: bytes) -> int:
    for version in range(1, MAX_VERSION + 1):
        count_bits = 8 if version < 10 else 16
        if 4 + count_bits + 8 * len(payload) <= 8 * _capacity(version):
            return version
    raise ValueError(f"payload of {len(payload)} bytes exceeds QR version {MAX_VERSION}-M")


def data_codewords(payload: bytes, version: int) -> list[int]:
    bits: list[int] = []

    def put(value: int, length: int) -> None:
        bits.extend((value >> (length - 1 - i)) & 1 for i in range(length))

    put(0b0100, 4)
    put(len(payload), 8 if version < 10 else 16)
    for byte in payload:
        put(byte, 8)
    capacity_bits = 8 * _capacity(version)
    put(0, min(4, capacity_bits - len(bits)))
    if len(bits) % 8:
        put(0, 8 - len(bits) % 8)
    codewords = [int("".join(map(str, bits[i : i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = (0xEC, 0x11)
    while len(codewords) < _capacity(version):
        codewords.append(pad[(len(codewords) - len(bits) // 8) % 2])
    return codewords


def interleave(codewords: list[int], version: int) -> list[int]:
    sizes, ec_len = _BLOCKS_M[version]
    blocks, offset = [], 0
    for size in sizes:
        blocks.append(codewords[offset : offset + size])
        offset += size
    ecs = [rs_remainder(block, ec_len) for block in blocks]
    out: list[int] = []
    for i in range(max(sizes)):
        out.extend(block[i] for block in blocks if i < len(block))
    for i in range(ec_len):
        out.extend(ec[i] for ec in ecs)
    return out


# ── Matrix ───────────────────────────────────────────────────────────────────
def _bch(value: int, poly: int, bits: int) -> int:
    top = poly.bit_length() - 1
    rem = value << top
    for shift in range(bits + top - 1, top - 1, -1):
        if rem & (1 << shift):
            rem ^= poly << (shift - top)
    return (value << top) | rem


def format_bits(mask: int) -> int:
    """15-bit format information for level M and `mask`, masked with 0x5412."""
    return _bch((_EC_LEVEL_M_BITS << 3) | mask, 0x537, 5) ^ 0x5412


def version_bits(version: int) -> int:
    return _bch(version, 0x1F25, 6)


_MASKS = (
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
)


def _base(version: int) -> tuple[list[list[int]], list[list[bool]]]:
    size = 17 + 4 * version
    grid = [[0] * size for _ in range(size)]
    reserved = [[False] * size for _ in range(size)]

    def setm(r: int, c: int, v: int) -> None:
        grid[r][c] = v
        reserved[r][c] = True

    for fr, fc in ((0, 0), (0, size - 7), (size - 7, 0)):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                r, c = fr + dr, fc + dc
                if 0 <= r < size and 0 <= c < size:
                    ring = max(abs(dr - 3), abs(dc - 3))
                    setm(r, c, 1 if ring in (0, 1, 3) and 0 <= dr <= 6 and 0 <= dc <= 6 else 0)
    for i in range(8, size - 8):
        setm(6, i, 1 - i % 2)
        setm(i, 6, 1 - i % 2)
    centres = _ALIGN[version]
    last = len(centres) - 1
    for ri, r0 in enumerate(centres):
        for ci, c0 in enumerate(centres):
            # Only the three corners that collide with a finder are skipped; a
            # centre on a timing line (v7+: (6, 22)) is still drawn over it.
            if (ri, ci) in ((0, 0), (0, last), (last, 0)):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    setm(r0 + dr, c0 + dc, 1 if max(abs(dr), abs(dc)) != 1 else 0)
    setm(size - 8, 8, 1)  # the dark module
    for i in range(9):  # format areas
        reserved[8][i] = reserved[i][8] = True
    for i in range(8):
        reserved[8][size - 1 - i] = reserved[size - 1 - i][8] = True
    if version >= 7:
        for i in range(6):
            for j in range(3):
                reserved[i][size - 11 + j] = reserved[size - 11 + j][i] = True
    return grid, reserved


def _place(grid: list[list[int]], reserved: list[list[bool]], stream: list[int]) -> None:
    size = len(grid)
    bits = [(byte >> (7 - i)) & 1 for byte in stream for i in range(8)]
    index, upward, col = 0, True, size - 1
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for r in rows:
            for c in (col, col - 1):
                if not reserved[r][c]:
                    grid[r][c] = bits[index] if index < len(bits) else 0
                    index += 1
        upward = not upward
        col -= 2


def _apply_meta(grid: list[list[int]], mask: int, version: int) -> None:
    size = len(grid)
    bits = format_bits(mask)
    for i in range(15):
        bit = (bits >> i) & 1
        # around the top-left finder
        if i < 6:
            grid[i][8] = bit
        elif i < 8:
            grid[i + 1][8] = bit
        else:
            grid[8][14 - i if i > 8 else 7] = bit
        # the split copy
        if i < 8:
            grid[8][size - 1 - i] = bit
        else:
            grid[size - 15 + i][8] = bit
    grid[size - 8][8] = 1
    if version >= 7:
        vbits = version_bits(version)
        for i in range(18):
            bit = (vbits >> i) & 1
            a, b = i // 3, size - 11 + i % 3
            grid[a][b] = grid[b][a] = bit


def _penalty(grid: list[list[int]]) -> int:
    size = len(grid)
    score = 0
    lines = grid + [list(col) for col in zip(*grid)]
    for line in lines:  # rule 1: runs of five or more
        run, prev = 0, -1
        for v in line:
            run = run + 1 if v == prev else 1
            prev = v
            if run == 5:
                score += 3
            elif run > 5:
                score += 1
        text = "".join(map(str, line))  # rule 3: finder-like patterns
        score += 40 * (text.count("10111010000") + text.count("00001011101"))
    for r in range(size - 1):  # rule 2: 2x2 blocks
        for c in range(size - 1):
            if grid[r][c] == grid[r][c + 1] == grid[r + 1][c] == grid[r + 1][c + 1]:
                score += 3
    dark = sum(map(sum, grid))  # rule 4: balance
    score += 10 * (abs(dark * 20 - size * size * 10) // (size * size))
    return score


def encode(text: str, *, mask: int | None = None) -> list[list[int]]:
    """The module matrix (1 = dark) for `text` as UTF-8 bytes, without quiet zone."""
    payload = text.encode("utf-8")
    version = choose_version(payload)
    stream = interleave(data_codewords(payload, version), version)
    best: tuple[int, list[list[int]]] | None = None
    for candidate in [mask] if mask is not None else range(8):
        grid, reserved = _base(version)
        _place(grid, reserved, stream)
        rule = _MASKS[candidate]
        for r in range(len(grid)):
            for c in range(len(grid)):
                if not reserved[r][c] and rule(r, c):
                    grid[r][c] ^= 1
        _apply_meta(grid, candidate, version)
        score = _penalty(grid)
        if best is None or score < best[0]:
            best = (score, grid)
    assert best is not None
    return best[1]


def matrix_rows(matrix: list[list[int]]) -> list[str]:
    """Rows as "0101…" strings — the compact wire form the print view draws."""
    return ["".join(map(str, row)) for row in matrix]


def to_svg(matrix: list[list[int]], *, module: int = 4, quiet: int = 4) -> str:
    """A self-contained SVG: one path of unit squares, black on white, crisp edges."""
    size = len(matrix) + 2 * quiet
    parts = [
        f"M{c + quiet},{r + quiet}h1v1h-1z"
        for r, row in enumerate(matrix)
        for c, v in enumerate(row)
        if v
    ]
    px = size * module
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" '
        f'viewBox="0 0 {size} {size}" shape-rendering="crispEdges">'
        f'<rect width="{size}" height="{size}" fill="#fff"/>'
        f'<path d="{"".join(parts)}" fill="#000"/></svg>'
    )
