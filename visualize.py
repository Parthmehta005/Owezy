"""Builds a self-contained HTML page with two SVG graphs. No I/O, no dependencies."""

import math
from html import escape

import logic

SIZE = 440
CENTER = SIZE / 2
RING = 155      # radius of the circle the people are placed on
NODE_R = 32     # radius of each person's node


def _positions(participants):
    """Place people evenly on a circle, starting from the top."""
    n = len(participants)
    positions = {}
    for i, name in enumerate(participants):
        angle = -math.pi / 2 + 2 * math.pi * i / n
        positions[name] = (CENTER + RING * math.cos(angle), CENTER + RING * math.sin(angle))
    return positions


def _short(name, limit=8):
    return name if len(name) <= limit else name[: limit - 1] + "…"


def _edge(positions, debtor, creditor, amount, color, marker_id):
    """One arrow (debtor -> creditor) with an amount label at its midpoint."""
    x1, y1 = positions[debtor]
    x2, y2 = positions[creditor]
    length = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / length, (y2 - y1) / length
    # Start/end on the node borders so arrowheads aren't hidden under the circles.
    sx, sy = x1 + ux * NODE_R, y1 + uy * NODE_R
    ex, ey = x2 - ux * (NODE_R + 3), y2 - uy * (NODE_R + 3)
    mx, my = (sx + ex) / 2, (sy + ey) / 2
    return (
        f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" '
        f'stroke="{color}" stroke-width="2" marker-end="url(#{marker_id})"/>'
        f'<text x="{mx:.1f}" y="{my:.1f}" class="amount" fill="{color}" '
        f'text-anchor="middle" dominant-baseline="middle">{logic.format_inr(amount)}</text>'
    )


def _graph_svg(participants, payments, color, marker_id):
    """SVG for one graph. payments = [(debtor, creditor, paise), ...]."""
    positions = _positions(participants)
    active = {name for debtor, creditor, _ in payments for name in (debtor, creditor)}

    parts = [
        f'<svg viewBox="0 0 {SIZE} {SIZE}" xmlns="http://www.w3.org/2000/svg">',
        f'<defs><marker id="{marker_id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" '
        f'orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="{color}"/></marker></defs>',
    ]
    for debtor, creditor, amount in payments:
        parts.append(_edge(positions, debtor, creditor, amount, color, marker_id))
    for name, (x, y) in positions.items():
        fill = "#dbeafe" if name in active else "#f3f4f6"
        parts.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{NODE_R}" fill="{fill}" stroke="#1e3a8a" stroke-width="2"/>'
            f'<text x="{x:.1f}" y="{y:.1f}" class="name" text-anchor="middle" '
            f'dominant-baseline="middle"><title>{escape(name)}</title>{escape(_short(name))}</text>'
        )
    if not payments:
        parts.append(
            f'<text x="{CENTER}" y="{CENTER}" class="name" text-anchor="middle">No payments needed</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def build_html(participants, before, after):
    """Return a full HTML page.

    before: {(debtor, creditor): paise}  (from logic.pairwise_debts)
    after:  [(debtor, creditor, paise)]  (from logic.simplify_debts)
    """
    before_list = [(d, c, amt) for (d, c), amt in before.items()]
    before_svg = _graph_svg(participants, before_list, "#dc2626", "arrow-before")
    after_svg = _graph_svg(participants, after, "#16a34a", "arrow-after")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Debt graphs</title>
<style>
  body {{ font-family: sans-serif; background: #fff; color: #111; margin: 24px; }}
  h1 {{ text-align: center; }}
  .summary {{ text-align: center; font-size: 1.1em; margin-bottom: 16px; }}
  .row {{ display: flex; flex-wrap: wrap; gap: 24px; justify-content: center; }}
  .panel {{ border: 1px solid #ddd; border-radius: 8px; padding: 12px; width: 440px; max-width: 100%; }}
  .panel h2 {{ text-align: center; font-size: 1.1em; margin: 0 0 8px; }}
  svg {{ width: 100%; height: auto; }}
  .name {{ font-size: 13px; font-weight: bold; fill: #1e3a8a; }}
  .amount {{ font-size: 13px; font-weight: bold; stroke: #fff; stroke-width: 4px; paint-order: stroke; }}
</style>
</head>
<body>
<h1>Debt graphs</h1>
<p class="summary">Payments needed: <b>{len(before_list)}</b> &rarr; <b>{len(after)}</b></p>
<div class="row">
  <div class="panel"><h2>Before simplification ({len(before_list)} payments)</h2>{before_svg}</div>
  <div class="panel"><h2>After simplification ({len(after)} payments)</h2>{after_svg}</div>
</div>
<p class="summary">An arrow A &rarr; B means "A pays B".</p>
</body>
</html>
"""