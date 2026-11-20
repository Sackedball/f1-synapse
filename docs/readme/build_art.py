"""Builds the animated SVGs used by the top-level README.

    python docs/readme/build_art.py

Writes docs/readme/hero.svg and docs/readme/pipeline.svg. Both are plain SVG
shown through <img>, so: no scripts, no web fonts, no external files.
Motion is CSS keyframes and SMIL. Colours come from web/src/design/tokens.css.
"""

import math
import os
import random
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))

# web/src/design/tokens.css
T = dict(
    s0="#0b0b10", s1="#15151e", s2="#1d1d28", s3="#272734", border="#2c2c3a", border_hi="#444458",
    t1="#ffffff", t2="#c4c4cf", t3="#9494a0", t4="#5c5c6a",
    accent="#e10600", accent_hi="#ff1801", success="#00d26a", warning="#ffd600",
    track="#2a2b38", track_edge="#5e637a",
)
MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace"
SANS = "'Titillium Web','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif"

BASE_CSS = f"""
.m{{font-family:{MONO}}} .s{{font-family:{SANS}}}
@media (prefers-reduced-motion: reduce){{*{{animation:none!important}}}}
"""


def f(x):
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s


def svg(w, h, title, desc, css, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
        f'role="img" aria-labelledby="t d"><title id="t">{escape(title)}</title>'
        f'<desc id="d">{escape(desc)}</desc><style>{BASE_CSS}{css}</style>{"".join(body)}</svg>\n'
    )


def text(x, y, s, size, fill, cls="m", anchor="start", weight=400, spacing=0, extra=""):
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    return (f'<text class="{cls}" x="{f(x)}" y="{f(y)}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}"{ls}{extra}>{escape(str(s))}</text>')


def frame(w, h):
    """Own dark background, so the art reads the same on GitHub's light and dark themes."""
    return [
        f'<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="14" fill="{T["s0"]}" stroke="{T["border"]}"/>',
        '<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">'
        f'<circle cx="2" cy="2" r="1" fill="{T["s3"]}"/></pattern>'
        f'<clipPath id="card"><rect x="1" y="1" width="{w - 2}" height="{h - 2}" rx="13"/></clipPath></defs>',
        f'<rect x="1" y="1" width="{w - 2}" height="{h - 2}" rx="13" fill="url(#dots)" opacity=".55"/>',
    ]


# ---------------------------------------------------------------------------
# Lettering: monoline, chamfered strokes on a 112 x 200 grid (stroke 32).
# Drawn as paths so the README needs no font files.
# ---------------------------------------------------------------------------
GLYPHS = {
    "S": (112, ["M96 16H40L16 40V76L40 100H72L96 124V160L72 184H16"]),
    "Y": (112, ["M16 16V68L56 108L96 68V16", "M56 100V184"]),
    "N": (112, ["M16 184V16L96 184V16"]),
    "A": (112, ["M16 184V48L48 16H64L96 48V184", "M16 112H96"]),
    "P": (112, ["M16 184V16H72L96 40V84L72 108H16"]),
    "E": (112, ["M96 16H16V184H96", "M16 100H82"]),
    "F": (112, ["M96 16H16V184", "M16 100H82"]),
    "1": (80, ["M16 46L48 16V184"]),
}


def word(s, x, y, scale, color, t0, gap=30, cls="ln"):
    out = []
    for i, ch in enumerate(s):
        adv, strokes = GLYPHS[ch]
        for k, d in enumerate(strokes):
            delay = t0 + i * 0.07 + k * 0.1
            out.append(f'<path class="{cls}" pathLength="1" d="{d}" stroke="{color}" '
                       f'transform="translate({f(x)} {f(y)}) scale({scale})" style="animation-delay:{delay:.2f}s"/>')
        x += (adv + gap) * scale
    return out, x


# ---------------------------------------------------------------------------
# Hero: name + tagline, and the core idea drawn as motion: irregular feeds
# go into the resampler and come out as one steady 25 Hz clock.
# ---------------------------------------------------------------------------

def hero():
    W, H = 1200, 470
    rnd = random.Random(25)
    css = """
.ln{fill:none;stroke-width:32;stroke-linejoin:miter;stroke-miterlimit:3;stroke-dasharray:1 1;
animation:ln .7s cubic-bezier(.7,0,.25,1) both}
@keyframes ln{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.fade{animation:fade .8s ease both}
@keyframes fade{from{opacity:0;transform:translateY(6px)}}
.flow{animation:flow 6s linear infinite}
@keyframes flow{from{transform:translateX(0)}to{transform:translateX(440px)}}
.tick{animation:tick 1.963636s linear infinite}
@keyframes tick{from{transform:translateX(0)}to{transform:translateX(144px)}}
.trace{animation:trace 7.5s linear infinite}
@keyframes trace{from{transform:translateX(0)}to{transform:translateX(550px)}}
.gate{animation:gate 1.2s ease-in-out infinite alternate}
@keyframes gate{from{opacity:.55}to{opacity:1}}
"""
    b = frame(W, H)
    b.append(text(40, 46, "FORMULA 1 RACE REPLAY  /  TELEMETRY  /  STRATEGY", 13, T["t3"], spacing=2.5,
                  cls="m fade"))
    b.append(text(W - 40, 46, "PYTHON · FASTAPI · REACT · PIXIJS", 13, T["t4"], anchor="end", spacing=2.5,
                  cls="m fade", extra=' style="animation-delay:.15s"'))
    b.append(f'<rect x="40" y="62" width="{W - 80}" height="1" fill="{T["border"]}"/>')

    sc = 0.66
    paths, x = word("F1", 40, 92, sc, T["accent"], 0.2)
    b += paths
    paths, x = word("SYNAPSE", x + 26, 92, sc, T["t1"], 0.45)
    b += paths

    b.append(text(40, 268, "Every lap, 25 times a second.", 28, T["t2"], weight=600,
                  cls="s fade", extra=' style="animation-delay:1.1s"'))
    b.append(text(40, 296, "Real timing data, resampled onto one clock, replayed on a live track map.", 16, T["t3"],
                  cls="s fade", extra=' style="animation-delay:1.25s"'))

    # --- resampling band -------------------------------------------------------
    top, bot = 328, 440
    b.append(f'<g class="fade" style="animation-delay:1.4s">')
    b.append(f'<rect x="24" y="{top - 8}" width="{W - 48}" height="{bot - top + 16}" rx="10" fill="{T["s1"]}" stroke="{T["border"]}"/>')

    lanes = [("POSITION", 352, 0.042, "dot"), ("CAR DATA", 382, 0.06, "dot"), ("EVENTS", 412, 0.009, "diamond")]
    in_x0, gate_x, P = 150, 600, 440
    b.append(f'<clipPath id="inclip"><rect x="{in_x0}" y="{top}" width="{gate_x - in_x0 - 4}" height="{bot - top}"/></clipPath>')
    for label, y, density, shape in lanes:
        b.append(text(44, y + 4, label, 11, T["t3"], spacing=2, weight=700))
        b.append(f'<rect x="{in_x0}" y="{y}" width="{gate_x - in_x0}" height="1" fill="{T["border"]}"/>')
        xs, xpos = [], 0.0
        while True:
            xpos += rnd.expovariate(density)
            if xpos >= P:
                break
            xs.append(xpos)
        marks = []
        for rep in (0, -P):
            for xx in xs:
                cx = in_x0 + xx + rep
                if shape == "dot":
                    marks.append(f'<circle cx="{f(cx)}" cy="{y}" r="3.2" fill="{T["t2"]}"/>')
                else:
                    marks.append(f'<rect x="{f(cx - 4)}" y="{y - 4}" width="8" height="8" fill="{T["warning"]}" '
                                 f'transform="rotate(45 {f(cx)} {y})"/>')
        b.append(f'<g clip-path="url(#inclip)"><g class="flow">{"".join(marks)}</g></g>')

    # the resampler
    b.append(f'<rect class="gate" x="{gate_x - 1.5}" y="{top + 2}" width="3" height="{bot - top - 4}" fill="{T["accent"]}"/>')
    b.append(f'<rect x="{gate_x - 44}" y="{top - 20}" width="88" height="20" rx="3" fill="{T["accent"]}"/>')
    b.append(text(gate_x, top - 6, "RESAMPLE", 11, T["t1"], anchor="middle", weight=700, spacing=1.5))

    # output: steady clock + the speed trace it produces
    out_x0, out_x1 = gate_x + 6, W - 40
    b.append(f'<clipPath id="outclip"><rect x="{out_x0}" y="{top}" width="{out_x1 - out_x0}" height="{bot - top}"/></clipPath>')
    ty = 420
    ticks = []
    for k in range(-12, (out_x1 - out_x0) // 12 + 2):
        x = out_x0 + k * 12
        ticks.append(f'<rect x="{x}" y="{ty - 7}" width="2" height="14" rx="1" fill="{T["success"]}"/>')
    b.append(f'<g clip-path="url(#outclip)"><g class="tick">{"".join(ticks)}</g></g>')

    Q = 550
    n = 220
    def speed(u):  # periodic, braking dips into corners
        v = 0.92
        for c, depth, width in ((0.12, 0.55, 0.035), (0.34, 0.3, 0.05), (0.52, 0.62, 0.03), (0.71, 0.22, 0.06), (0.88, 0.45, 0.04)):
            d = min(abs(u - c), 1 - abs(u - c))
            v -= depth * math.exp(-(d / width) ** 2)
        return v
    pts = []
    for rep in (-1, 0):
        for i in range(n + 1):
            u = i / n
            x = out_x0 + (rep + u) * Q
            y = 398 - 44 * speed(u)
            pts.append(f"{f(x)} {f(y)}")
    b.append(f'<g clip-path="url(#outclip)"><g class="trace"><path d="M{" L".join(pts)}" fill="none" '
             f'stroke="{T["t1"]}" stroke-width="2" stroke-linejoin="round"/></g></g>')
    b.append(text(out_x1, top + 12, "SPEED", 11, T["t3"], anchor="end", weight=700, spacing=2))
    b.append(text(out_x1, ty - 14, "ONE CLOCK  ·  25 Hz  ·  Δt 0.04 s", 11, T["success"], anchor="end", weight=700, spacing=1.5))
    b.append("</g>")

    return svg(W, H, "F1 Synapse",
               "F1 Synapse: Formula 1 race replay, telemetry and strategy. Every lap, 25 times a second. "
               "Animated: irregular position, car-data and event samples flow into a resampler and come out "
               "as one steady 25 Hz clock and a smooth speed trace.", css, b)


# ---------------------------------------------------------------------------
# Pipeline: five stages, one packet travelling through them.
# Every label below is checked against the code on main.
# ---------------------------------------------------------------------------

STAGES = [
    ("INGEST", ["FastF1 timing feeds", "per-driver extraction", "in a 4-process pool"], "raw feeds"),
    ("RESAMPLE", ["every channel on one", "25 Hz clock", "positions snapped to", "the centerline (k-d tree)"], "25 Hz frames"),
    ("PREDICT", ["Bayesian tyre model", "overtake odds: LightGBM", "pit window: XGBoost"], "+ predictions"),
    ("STREAM", ["F1SC binary chunks", "60 s of frames each", "served by FastAPI"], "F1SC chunk"),
    ("RENDER", ["zero-allocation sampler", "PixiJS v8 track canvas", "uPlot + Dockview panels"], "on screen"),
]


def pipeline():
    W, H = 1200, 372
    css_parts = []
    b = frame(W, H)
    b.append(text(40, 46, "HOW A RACE GETS ON SCREEN", 13, T["t3"], spacing=2.5, weight=700))
    b.append(text(W - 40, 46, "PYTHON BACKEND  →  BROWSER", 13, T["t4"], anchor="end", spacing=2.5))
    b.append(f'<rect x="40" y="62" width="{W - 80}" height="1" fill="{T["border"]}"/>')

    xs = [140 + i * 230 for i in range(5)]
    ly = 150
    D = 8.0  # seconds per loop
    seg = 1 / 5
    dwell = 0.07

    b.append(f'<rect x="{xs[0]}" y="{ly - 1}" width="{xs[-1] - xs[0]}" height="2" fill="{T["border_hi"]}"/>')
    # progress line that follows the packet
    css_parts.append(f".prog{{transform-box:fill-box;transform-origin:0 50%;animation:prog {D}s linear infinite}}")
    kf = []
    for i in range(5):
        a = i * seg
        kf.append(f"{a * 100:.2f}%{{transform:scaleX({i / 4:.4f})}}")
        kf.append(f"{(a + dwell) * 100:.2f}%{{transform:scaleX({i / 4:.4f})}}")
    kf.append("96%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}")
    css_parts.append("@keyframes prog{" + "".join(kf) + "}")
    b.append(f'<rect class="prog" x="{xs[0]}" y="{ly - 1}" width="{xs[-1] - xs[0]}" height="2" fill="{T["accent"]}"/>')

    for i, (name, lines, _) in enumerate(STAGES):
        x = xs[i]
        a = i * seg
        css_parts.append(
            f".n{i}{{animation:n{i} {D}s linear infinite}}"
            f"@keyframes n{i}{{0%,{max(a * 100 - 0.01, 0):.2f}%{{fill:{T['s1']};stroke:{T['border_hi']}}}"
            f"{a * 100 + 0.5:.2f}%,96%{{fill:{T['accent']};stroke:{T['accent']}}}100%{{fill:{T['s1']};stroke:{T['border_hi']}}}}}"
        )
        b.append(text(x, ly - 30, f"0{i + 1}", 13, T["t4"], anchor="middle", weight=700, spacing=2))
        b.append(f'<circle class="n{i}" cx="{x}" cy="{ly}" r="9" stroke-width="2" fill="{T["s1"]}" stroke="{T["border_hi"]}"/>')
        b.append(text(x, ly + 50, name, 24, T["t1"], cls="s", anchor="middle", weight=700, spacing=3))
        for k, line in enumerate(lines):
            b.append(text(x, ly + 82 + k * 25, line, 16, T["t3"], cls="s", anchor="middle"))

    # the packet and its label, which changes as it moves
    kf = []
    for i in range(5):
        a = i * seg
        dx = xs[i] - xs[0]
        kf.append(f"{a * 100:.2f}%{{transform:translateX({dx}px)}}")
        kf.append(f"{(a + dwell) * 100:.2f}%{{transform:translateX({dx}px)}}")
    kf.append(f"100%{{transform:translateX({xs[-1] - xs[0]}px)}}")
    css_parts.append(f".pk{{animation:pk {D}s cubic-bezier(.6,0,.3,1) infinite}}@keyframes pk{{{''.join(kf)}}}")
    pk = [f'<g class="pk"><circle cx="{xs[0]}" cy="{ly}" r="5" fill="{T["t1"]}"/>']
    for i, (_, _, payload) in enumerate(STAGES):
        a, z = i * seg, (i + 1) * seg
        css_parts.append(
            f".p{i}{{opacity:0;animation:p{i} {D}s steps(1,end) infinite}}"
            f"@keyframes p{i}{{0%{{opacity:0}}{a * 100:.2f}%{{opacity:1}}{min(z * 100, 99.9):.2f}%{{opacity:0}}100%{{opacity:0}}}}"
        )
        pk.append(f'<g class="p{i}"><rect x="{xs[0] - 60}" y="{ly - 64}" width="120" height="20" rx="3" '
                  f'fill="{T["s3"]}"/>{text(xs[0], ly - 50, payload, 11, T["t2"], anchor="middle", weight=700, spacing=1)}</g>')
    pk.append("</g>")
    b += pk

    b.append(text(40, H - 24, "Raw feeds arrive at different, uneven rates. Everything is put on one clock "
                  "before it reaches the browser, so the map, tower and charts always agree.", 13, T["t4"], cls="s"))

    return svg(W, H, "How F1 Synapse works",
               "Five stages: ingest FastF1 timing feeds with per-driver extraction in a 4-process pool; resample every "
               "channel onto one 25 Hz clock and snap positions to the track centerline; predict with a Bayesian tyre "
               "model, a LightGBM overtake model and an XGBoost pit-window model; stream F1SC binary chunks of 60 seconds "
               "through FastAPI; render with a zero-allocation sampler, a PixiJS v8 track canvas and uPlot and Dockview "
               "panels.", "".join(css_parts), b)


def main():
    for name, fn in (("hero", hero), ("pipeline", pipeline)):
        p = os.path.join(HERE, f"{name}.svg")
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(fn())
        print(f"wrote {p}  {os.path.getsize(p) // 1024} KB")


if __name__ == "__main__":
    main()
