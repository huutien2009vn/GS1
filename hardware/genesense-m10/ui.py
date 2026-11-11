"""Drawing for the 240x320 screen in the GeneSense app's look (light theme, Be Vietnam Pro).

Everything is drawn at twice the size and scaled down, which smooths the edges of text and shapes.
Only Pillow features from old versions are used (the M10 runs Debian 10).
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 240, 320
S = 2                                        # drawing scale
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_FILES = {"medium": "BeVietnamPro-Medium.ttf", "semibold": "BeVietnamPro-SemiBold.ttf", "bold": "BeVietnamPro-Bold.ttf"}


def hexc(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))


# the GeneSense app's colours
BG, SURF, LINE, LINE2 = hexc("#f4f8ff"), hexc("#ffffff"), hexc("#dbe5f1"), hexc("#b7c7dc")
INK, INK2, NAVY, LOGO, PULSE = hexc("#10264b"), hexc("#52627a"), hexc("#0d2c69"), hexc("#0d2c54"), hexc("#9cc3ef")
BLUE, BLUE_SOFT, CHART = hexc("#0756ce"), hexc("#eaf3ff"), hexc("#0b57a4")
GREEN, GREEN_BG = hexc("#17663a"), hexc("#e5f2ea")
AMBER, AMBER_BG, AMBER_LINE = hexc("#7a4d00"), hexc("#fcf1d6"), hexc("#efd083")
RED, RED_BG, RED_SOLID = hexc("#a8201a"), hexc("#fbe9e8"), hexc("#b3261e")
ZONE = {"safe": hexc("#b5d9c2"), "attention": hexc("#efd083"), "alert": hexc("#eaa9a4")}
SKIN, NAIL = (240, 190, 150), (250, 220, 205)
BLACK, WHITE = (0, 0, 0), (255, 255, 255)

SAFE, ATTN, ALERT = "safe", "attention", "alert"
LEVEL_COLOR = {SAFE: GREEN, ATTN: AMBER, ALERT: RED}
LEVEL_BG = {SAFE: GREEN_BG, ATTN: AMBER_BG, ALERT: RED_BG}

_fonts = {}


def font(weight, size):
    key = (weight, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(os.path.join(HERE, "fonts", FONT_FILES[weight]), size * S)
    return _fonts[key]


SMALL, BODY, BOLD, TITLE, BIG, NUM, HUGE = (("medium", 15), ("medium", 17), ("semibold", 17), ("semibold", 22),
                                            ("bold", 27), ("bold", 44), ("bold", 56))


def vn(v, digits=1):                         # Vietnamese decimal comma: 31,2
    return (("%." + str(digits) + "f") % v).replace(".", ",")


class Canvas:
    """One frame. Coordinates are in screen pixels; `hits` collects the touch areas drawn on it."""

    def __init__(self, bg=BG):
        self.img = Image.new("RGB", (W * S, H * S), bg)
        self.d = ImageDraw.Draw(self.img)
        self.hits = []                       # (x0, y0, x1, y1, action)

    def frame(self):
        return self.img.resize((W, H), Image.LANCZOS)

    def tap(self, x, y, w, h, action):
        self.hits.append((x, y, x + w, y + h, action))

    # ---------- shapes ----------
    def rect(self, x, y, w, h, fill):
        self.d.rectangle([x * S, y * S, (x + w) * S - 1, (y + h) * S - 1], fill=fill)

    def rr(self, x, y, w, h, r, fill):        # rounded rectangle (works on old Pillow)
        x0, y0, x1, y1 = x * S, y * S, (x + w) * S - 1, (y + h) * S - 1
        r = min(r * S, (x1 - x0) // 2, (y1 - y0) // 2)
        d = self.d
        if r <= 0:
            d.rectangle([x0, y0, x1, y1], fill=fill)
            return
        d.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
        d.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
        for cx, cy in ((x0, y0), (x1 - 2 * r, y0), (x0, y1 - 2 * r), (x1 - 2 * r, y1 - 2 * r)):
            d.ellipse([cx, cy, cx + 2 * r, cy + 2 * r], fill=fill)

    def card(self, x, y, w, h, r, fill=SURF, border=LINE, bw=1):
        self.rr(x, y, w, h, r, border)
        self.rr(x + bw, y + bw, w - 2 * bw, h - 2 * bw, max(0, r - bw), fill)

    def disc(self, cx, cy, r, fill):
        self.d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=fill)

    def line(self, x0, y0, x1, y1, width, fill):   # with round ends
        self.d.line([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill, width=int(width * S))
        for x, y in ((x0, y0), (x1, y1)):
            self.disc(x, y, width / 2.0, fill)

    def poly(self, pts, fill):
        self.d.polygon([(x * S, y * S) for x, y in pts], fill=fill)

    def ring(self, cx, cy, r0, r1, frac, fill):     # from 12 o'clock, clockwise, round ends
        if frac <= 0:
            return
        box = [(cx - r1) * S, (cy - r1) * S, (cx + r1) * S, (cy + r1) * S]
        width = int((r1 - r0) * S)
        if frac >= 1:
            self.d.ellipse(box, outline=fill, width=width)
            return
        self.d.arc(box, -90, -90 + 360 * frac, fill=fill, width=width)
        rm, rc = (r0 + r1) / 2.0, (r1 - r0) / 2.0
        end = frac * 2 * math.pi
        self.disc(cx, cy - rm, rc, fill)
        self.disc(cx + rm * math.sin(end), cy - rm * math.cos(end), rc, fill)

    # ---------- text ----------
    def text_w(self, s, f):
        fo = font(*f)
        if hasattr(fo, "getlength"):
            return fo.getlength(s) / S
        return fo.getsize(s)[0] / float(S)

    def text(self, x, base, s, color, f):  # x = left edge, base = baseline
        fo = font(*f)
        self.d.text((x * S, base * S - fo.getmetrics()[0]), s, font=fo, fill=color)
        return x + self.text_w(s, f)

    def text_c(self, cx, base, s, color, f):
        self.text(cx - self.text_w(s, f) / 2.0, base, s, color, f)

    def text_r(self, right, base, s, color, f):
        self.text(right - self.text_w(s, f), base, s, color, f)

    def split(self, s, f, max_w, max_lines=5):
        lines, line = [], ""
        for word in s.split():
            test = (line + " " + word).strip()
            if line and self.text_w(test, f) > max_w:
                lines.append(line)
                line = word
            else:
                line = test
        if line:
            lines.append(line)
        return lines[:max_lines]

    def wrap_c(self, base, s, color, f, max_w=W - 24):
        for ln in self.split(s, f, max_w):
            self.text_c(W / 2.0, base, ln, color, f)
            base += int(f[1] * 1.3)
        return base

    # ---------- pieces ----------
    def logo(self, x, y, s):
        k = s / 64.0
        self.rr(x, y, s, s, 12 * k, LOGO)
        self.line(x + 32 * k, y + 14 * k, x + 32 * k, y + 50 * k, 9 * k, SURF)
        self.line(x + 14 * k, y + 32 * k, x + 50 * k, y + 32 * k, 9 * k, SURF)
        pts = [(20, 38), (27, 38), (31, 26), (36, 43), (40, 34), (47, 34)]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            self.line(x + ax * k, y + ay * k, x + bx * k, y + by * k, max(1.4, 3 * k), PULSE)

    def mark(self, x, y, level, s=14, color=None):   # circle = safe, triangle = attention, octagon = danger
        c = color or LEVEL_COLOR[level]
        if level == SAFE:
            self.disc(x + s / 2.0, y + s / 2.0, s / 2.0, c)
        elif level == ATTN:
            self.poly([(x + s / 2.0, y), (x + s, y + s), (x, y + s)], c)
        else:
            a, b = s * 0.3, s * 0.7
            self.poly([(x + a, y), (x + b, y), (x + s, y + a), (x + s, y + b), (x + b, y + s), (x + a, y + s), (x, y + b), (x, y + a)], c)

    def status_icon(self, cx, cy, level):
        if level == SAFE:
            self.disc(cx, cy, 22, GREEN)
            self.line(cx - 10, cy + 1, cx - 3, cy + 8, 4, SURF)
            self.line(cx - 3, cy + 8, cx + 10, cy - 7, 4, SURF)
            return
        if level == ATTN:
            self.poly([(cx, cy - 22), (cx + 24, cy + 19), (cx - 24, cy + 19)], AMBER)
        else:
            self.mark(cx - 22, cy - 22, ALERT, 44)
        top, bottom, dot = (-7, 5, 12) if level == ATTN else (-11, 3, 11)
        self.line(cx, cy + top, cx, cy + bottom, 4.5, SURF)
        self.disc(cx, cy + dot, 2.6, SURF)

    def tag(self, x, y, level, word, f=BOLD):         # like .tag in the app
        w = 40 + self.text_w(word, f)
        self.rr(x, y, w, 28, 6, LEVEL_BG[level])
        self.mark(x + 9, y + 7, level)
        self.text(x + 30, y + 20, word, LEVEL_COLOR[level], f)
        return w

    def heart(self, x, y, s, color):
        self.disc(x - s / 2.0, y - s / 6.0, s / 2.0 + 0.5, color)
        self.disc(x + s / 2.0, y - s / 6.0, s / 2.0 + 0.5, color)
        self.poly([(x - s - 0.3, y + s / 10.0), (x + s + 0.3, y + s / 10.0), (x, y + s)], color)

    def wifi_icon(self, cx, cy, color):
        for r in (4.5, 9):
            box = [(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S]
            self.d.arc(box, -135, -45, fill=color, width=int(1.8 * S))
        self.disc(cx, cy, 1.6, color)

    def bt_icon(self, cx, cy, color):
        for a, b in (((cx, cy - 7), (cx, cy + 7)), ((cx, cy - 7), (cx + 4, cy - 3.5)), ((cx + 4, cy - 3.5), (cx - 4, cy + 3.5)),
                     ((cx, cy + 7), (cx + 4, cy + 3.5)), ((cx + 4, cy + 3.5), (cx - 4, cy - 3.5))):
            self.line(a[0], a[1], b[0], b[1], 1.6, color)

    def chip(self, right, on, wifi):
        x, y = right - 22, 9
        if on:
            self.rr(x, y, 22, 22, 7, BLUE)
        else:
            self.card(x, y, 22, 22, 7, SURF, LINE2)
        c = SURF if on else INK2
        if wifi:
            self.wifi_icon(x + 11, y + 17, c)
        else:
            self.bt_icon(x + 11, y + 11, c)
        if not on:
            self.line(x + 4, y + 18, x + 18, y + 4, 1.6, INK2)
        return x - 3

    def top_bar(self, clock, wifi_on, phone_on):
        self.rect(0, 0, W, 40, SURF)
        self.rect(0, 40, W, 1, LINE)
        self.logo(6, 9, 22)
        self.text(34, 26, "GeneSense", NAVY, BOLD)
        x = self.chip(W - 6, wifi_on, True)
        if phone_on is not None:
            x = self.chip(x, phone_on, False)
        if clock:
            self.text_r(x - 3, 26, clock, INK2, SMALL)

    def strip(self, mock):
        self.rect(0, H - 22, W, 22, AMBER_BG)
        self.rect(0, H - 22, W, 1, AMBER_LINE)
        self.text_c(W / 2.0, H - 6, "THỬ NGHIỆM · SỐ LIỆU GIẢ LẬP" if mock else "THIẾT BỊ THỬ NGHIỆM", AMBER, SMALL)

    BTN_Y, BTN_H = H - 66, 38

    def button(self, left, label, action, style="plain", key=None):
        """A big touch button at the bottom (left or right half). `key` is the board button that does the same."""
        if not label:
            return
        w = (W - 18) // 2
        x, y = (6 if left else W - 6 - w), self.BTN_Y
        fg, badge, letter = BLUE, BLUE_SOFT, BLUE
        if style == "main":
            self.rr(x, y, w, self.BTN_H, 12, BLUE)
            fg, badge = SURF, SURF
        elif style == "onred":
            self.card(x, y, w, self.BTN_H, 12, RED_SOLID, SURF, 2)
            fg, badge, letter = SURF, SURF, RED_SOLID
        else:
            self.card(x, y, w, self.BTN_H, 12, SURF, LINE2)
        key = key or ("A" if left else "B")
        self.disc(x + 17, y + self.BTN_H / 2.0, 10, badge)
        self.text_c(x + 17, y + self.BTN_H / 2 + 6, key, letter, BOLD)
        f = BOLD if self.text_w(label, BOLD) <= w - 34 else SMALL
        self.text_c(x + 30 + (w - 34) / 2.0, y + self.BTN_H / 2 + 6, label, fg, f)
        self.tap(x, y, w, self.BTN_H, action)

    def row(self, y, h, label, value, last, warn=False):
        self.text(22, y + h / 2.0 + 5, label, INK2, SMALL)
        room = W - 44 - self.text_w(label, SMALL) - 10 - (18 if warn else 0)
        f = BOLD if self.text_w(value, BOLD) <= room else SMALL
        while len(value) > 2 and self.text_w(value, f) > room:   # a long name: cut it short
            value = value[:-2].rstrip() + "…"
        self.text_r(W - 22, y + h / 2.0 + 6, value, AMBER if warn else INK, f)
        if warn:
            self.mark(W - 22 - self.text_w(value, f) - 18, y + h / 2.0 - 6, ATTN, 12)
        if not last:
            self.rect(20, y + h, W - 40, 1, LINE)

    def toast(self, text, level, top=False):
        f = BOLD
        lines = self.split(text, f, W - 66, 2)
        if len(lines) > 1:
            f = BODY
            lines = self.split(text, f, W - 66, 2)
        h = 58 if len(lines) > 1 else 40
        y = 6 if top else self.BTN_Y - 8 - h
        border = tuple((a * 165 + b * 90) // 255 for a, b in zip(LEVEL_BG[level], LEVEL_COLOR[level]))
        self.card(10, y, W - 20, h, 12, LEVEL_BG[level], border)
        self.mark(22, y + h / 2.0 - 7, level)
        for i, ln in enumerate(lines):
            self.text(46, y + 26 + i * 20 - (1 if len(lines) > 1 else 0), ln, LEVEL_COLOR[level], f)

    def qr(self, matrix, y, box):            # matrix: list of rows of booleans
        n = len(matrix)
        scale = max(1, box // (n + 4))
        full = (n + 4) * scale
        x0 = (W - full) // 2
        self.card(x0 - 4, y - 4, full + 8, full + 8, 12, SURF, LINE)
        for r, row in enumerate(matrix):
            for c, on in enumerate(row):
                if on:
                    self.rect(x0 + (c + 2) * scale, y + (r + 2) * scale, scale, scale, BLACK)
