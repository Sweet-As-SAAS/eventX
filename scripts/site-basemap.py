"""Site plan basemap: a map picture of a venue, cropped to the site plan canvas shape (800x500, 16:10).

One-off demo tooling, run by hand. Needs Python 3 and Pillow (pip install pillow). The output PNG is committed and
referenced from fixtures/demo-event.json (siteBasemap), so the app never fetches map tiles at runtime.

Map data (c) OpenStreetMap contributors, ODbL. Keep the attribution next to the image wherever it is shown.
Tiles come from tile.openstreetmap.org: a few dozen, once, with a descriptive User-Agent, per its usage policy.

  python3 scripts/site-basemap.py --lat <lat> --lng <lng> --metres <width in metres> --zoom 19 --out public/site-plan/<name>.png
"""
import argparse
import io
import math
import subprocess

from PIL import Image

TILE = 256
UA = "HostReady-site-plan-basemap/0.1 (+https://github.com/Sweet-As-SAAS/hostready)"
OUT_W, OUT_H = 1600, 1000  # 2x the 800x500 canvas, so it stays sharp on high-density screens


def world_px(lat: float, lng: float, zoom: int) -> tuple[float, float]:
    """Web Mercator pixel position at this zoom."""
    n = TILE * 2**zoom
    phi = math.radians(lat)
    return (lng + 180) / 360 * n, (1 - math.log(math.tan(phi) + 1 / math.cos(phi)) / math.pi) / 2 * n


def tile(zoom: int, x: int, y: int) -> Image.Image:
    # curl uses the system certificate store (python.org builds on macOS often have none).
    png = subprocess.run(["curl", "-sfL", "--max-time", "20", "-A", UA, f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png"],
                         check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(png)).convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lng", type=float, required=True)
    ap.add_argument("--metres", type=float, required=True, help="width of the area shown")
    ap.add_argument("--zoom", type=int, default=19)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    metres_per_px = 156543.03392 * math.cos(math.radians(a.lat)) / 2**a.zoom
    w = a.metres / metres_per_px
    h = w * OUT_H / OUT_W
    cx, cy = world_px(a.lat, a.lng, a.zoom)
    left, top = cx - w / 2, cy - h / 2
    x0, y0 = int(left // TILE), int(top // TILE)
    x1, y1 = int((left + w) // TILE), int((top + h) // TILE)

    sheet = Image.new("RGB", ((x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE))
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            sheet.paste(tile(a.zoom, x, y), ((x - x0) * TILE, (y - y0) * TILE))
    ox, oy = left - x0 * TILE, top - y0 * TILE
    crop = sheet.crop((round(ox), round(oy), round(ox + w), round(oy + h)))
    crop.resize((OUT_W, OUT_H), Image.LANCZOS).save(a.out, optimize=True)
    print(f"{a.out}: {OUT_W}x{OUT_H}, {a.metres:.0f} m across, {(x1 - x0 + 1) * (y1 - y0 + 1)} tiles at zoom {a.zoom}")


if __name__ == "__main__":
    main()
