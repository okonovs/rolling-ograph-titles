"""Render frames of the graphic in headless Chrome (non-real-time mode) and check
that every frame is the previous one shifted up by exactly `pixelsPerFrame` px.

Usage: python3 tools/verify_pixel_shift.py [--chrome /path/to/chrome] [--ppf 3]
Requires: pip install playwright pillow numpy
"""
import argparse, asyncio, io, json, pathlib
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

async def main(a):
    man = json.loads((ROOT / "template/rolling-credits.ograf.json").read_text())
    data = {k: v.get("default") for k, v in man["schema"]["properties"].items()}
    data["pixelsPerFrame"] = a.ppf
    async with async_playwright() as p:
        kw = {"executable_path": a.chrome} if a.chrome else {}
        b = await p.chromium.launch(args=["--allow-file-access-from-files"], **kw)
        pg = await b.new_page(viewport={"width": 1920, "height": 1080})
        await pg.goto((ROOT / "tools/harness.html").as_uri())
        await pg.wait_for_function("window.ready")
        await pg.evaluate('d => g.load({renderType: "nonrealtime", data: d})', data)
        prev, ok = None, True
        for f in range(200, 260):
            await pg.evaluate(f"g.goToTime({{timestamp: {f} * 1000 / 25}})")
            img = np.asarray(Image.open(io.BytesIO(await pg.screenshot())).convert("L"))
            if prev is not None and not np.array_equal(prev[a.ppf:], img[:-a.ppf]):
                ok = False
                print(f"frame {f}: NOT an exact {a.ppf}px shift")
            prev = img
        await b.close()
    print(f"PASS: every frame moved exactly {a.ppf}px" if ok else "FAIL")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome")
    ap.add_argument("--ppf", type=int, default=3)
    asyncio.run(main(ap.parse_args()))
