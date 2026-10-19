"""Build the Inkan demo video from scenes.json.

SPDX-License-Identifier: Apache-2.0

Every picture in this video is either typography or a capture of something that
really ran: a terminal run, a transaction on a public explorer. The pictures are
rendered from HTML by headless Edge, so a number in the video is a number that was
read out of a file (`docs/receipts/preview.json`, the test and mutation logs), not
one typed into a slide.

A scene is a list of "states". Each state is one cumulative picture -- the first
shows the heading, the second adds a line, and so on -- so a scene builds up on
screen instead of appearing at once. Each state carries the sentence spoken while
it is visible, and the same sentence is burned in as a caption.

    python video/build.py            # builds docs/inkan-demo.mp4
    python video/build.py --stills   # renders the pictures only

Needs: Microsoft Edge, ffmpeg, ffprobe, `pip install edge-tts`.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
WORK = ROOT / "work"
OUT = REPO / "docs" / "inkan-demo.mp4"
FONT = (ROOT / "fonts" / "InstrumentSans.ttf").resolve().as_uri()

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VOICE = "en-GB-RyanNeural"
W, H, FPS = 1920, 1080, 30
XFADE = 0.35  # seconds of cross-fade between states of one scene
DIP = 0.45  # seconds fading in and out at the edges of a scene

CSS = f"""
@font-face {{ font-family: 'Instrument'; src: url('{FONT}'); font-weight: 400 700; }}
:root {{
  --ink: #0d1424; --ink2: #141c30; --line: #2a3553; --text: #eef1f8; --dim: #9aa6c4;
  --accent: #e9b44c; --ok: #5ccf9a; --bad: #ef6b6b; --blue: #7aa2ff;
}}
* {{ box-sizing: border-box; margin: 0; }}
body {{ width: {W}px; height: {H}px; background: var(--ink); color: var(--text);
  font-family: 'Instrument', 'Segoe UI', sans-serif; overflow: hidden; position: relative; }}
.grid {{ position: absolute; inset: 0;
  background-image: linear-gradient(var(--line) 1px, transparent 1px),
                    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 96px 96px; opacity: .22; }}
.frame {{ position: absolute; inset: 0; padding: 110px 150px 190px; display: flex; flex-direction: column; justify-content: center; }}
.kicker {{ color: var(--accent); font-size: 26px; letter-spacing: .16em; text-transform: uppercase; font-weight: 600; margin-bottom: 26px; }}
h1 {{ font-size: 104px; line-height: 1.04; font-weight: 700; letter-spacing: -.02em; max-width: 1500px; }}
h2 {{ font-size: 68px; line-height: 1.1; font-weight: 700; letter-spacing: -.015em; max-width: 1550px; margin-bottom: 36px; }}
p.lead {{ font-size: 40px; line-height: 1.38; color: var(--dim); max-width: 1380px; }}
.rule {{ width: 120px; height: 5px; background: var(--accent); margin: 34px 0; }}
ul {{ list-style: none; padding: 0; display: grid; gap: 22px; max-width: 1500px; }}
li {{ font-size: 38px; line-height: 1.32; padding-left: 40px; position: relative; color: var(--text); }}
li::before {{ content: ''; position: absolute; left: 0; top: .5em; width: 14px; height: 14px; background: var(--accent); border-radius: 2px; }}
li b {{ color: var(--accent); font-weight: 600; }}
.cards {{ display: grid; grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 28px; max-width: 1600px; }}
.card {{ background: var(--ink2); border: 1px solid var(--line); border-radius: 14px; padding: 34px 36px; }}
.card .n {{ font-size: 78px; font-weight: 700; color: var(--accent); letter-spacing: -.02em; line-height: 1; }}
.card .l {{ font-size: 28px; color: var(--dim); margin-top: 14px; line-height: 1.3; }}
.term {{ background: #070b14; border: 1px solid var(--line); border-radius: 14px; padding: 30px 38px;
  font-family: Consolas, 'Cascadia Mono', monospace; font-size: 29px; line-height: 1.52; max-width: 1640px; color: #cfd8ee; white-space: pre; }}
.term .p {{ color: var(--accent); }} .term .ok {{ color: var(--ok); }} .term .bad {{ color: var(--bad); }}
.term .dim {{ color: #6f7ba0; }} .term .hash {{ color: var(--blue); }}
.tbl {{ width: 100%; max-width: 1640px; border-collapse: collapse; font-size: 29px; }}
.tbl th {{ text-align: left; color: var(--dim); font-weight: 500; font-size: 24px; letter-spacing: .08em; text-transform: uppercase; padding: 12px 18px; border-bottom: 1px solid var(--line); }}
.tbl td {{ padding: 17px 18px; border-bottom: 1px solid #1c2640; vertical-align: top; }}
.tbl td.mono {{ font-family: Consolas, monospace; color: var(--blue); font-size: 26px; }}
.pill {{ display: inline-block; padding: 4px 16px; border-radius: 999px; font-size: 24px; font-weight: 600; }}
.pill.ok {{ background: #123a2b; color: var(--ok); }} .pill.no {{ background: #3d1a1d; color: var(--bad); }}
.flow {{ display: flex; align-items: center; gap: 22px; max-width: 1650px; }}
.box {{ background: var(--ink2); border: 1px solid var(--line); border-radius: 14px; padding: 28px 30px; font-size: 32px; line-height: 1.3; flex: 1; text-align: center; }}
.box small {{ display: block; color: var(--dim); font-size: 23px; margin-top: 10px; }}
.arrow {{ color: var(--accent); font-size: 48px; }}
.shot {{ border: 1px solid var(--line); border-radius: 14px; max-height: 640px; max-width: 1640px; display: block; }}
.cap {{ position: absolute; left: 0; right: 0; bottom: 0; height: 150px; background: linear-gradient(transparent, rgba(5,8,16,.92) 40%);
  display: flex; align-items: flex-end; justify-content: center; padding: 0 200px 46px; }}
.cap span {{ font-size: 34px; line-height: 1.3; text-align: center; color: #fff; max-width: 1500px; }}
.brand {{ position: absolute; top: 48px; left: 150px; font-size: 25px; letter-spacing: .12em; color: var(--dim); text-transform: uppercase; font-weight: 600; }}
.brand b {{ color: var(--accent); }}
.tag {{ position: absolute; top: 48px; right: 150px; font-size: 22px; color: var(--dim); border: 1px solid var(--line); padding: 6px 16px; border-radius: 999px; }}
"""


def page(body: str, caption: str, label: str) -> str:
    cap = f'<div class="cap"><span>{html.escape(caption)}</span></div>' if caption else ""
    return (
        f"<!doctype html><meta charset='utf-8'><style>{CSS}</style><body><div class='grid'></div>"
        f"<div class='brand'><b>Inkan</b> on Midnight</div><div class='tag'>{html.escape(label)}</div>"
        f"<div class='frame'>{body}</div>{cap}</body>"
    )


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f"command failed: {' '.join(map(str, cmd))[:200]}\n{r.stderr[-1500:]}")
    return r


def render(html_text: str, png: Path) -> None:
    src = png.with_suffix(".html")
    src.write_text(html_text, encoding="utf-8")
    # Edge sometimes exits non-zero after writing the picture, with an internal
    # task-manager warning. The picture is what matters, so that is what is checked,
    # and a failed attempt is retried once.
    for attempt in range(2):
        png.unlink(missing_ok=True)
        subprocess.run([
            EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
            f"--window-size={W},{H}", f"--screenshot={png}", "--virtual-time-budget=1500", src.resolve().as_uri(),
        ], capture_output=True, text=True)
        if png.exists() and png.stat().st_size >= 5000:
            return
    sys.exit(f"render produced no picture for {png.name}")


async def speak(text: str, mp3: Path) -> None:
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate="-4%").save(str(mp3))


def duration(path: Path) -> float:
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(r.stdout.strip())


def build(scenes: list[dict], stills_only: bool) -> None:
    WORK.mkdir(exist_ok=True)
    scene_videos: list[Path] = []
    scene_audios: list[Path] = []

    for si, scene in enumerate(scenes):
        sid = f"{si:02d}-{scene['id']}"
        states = scene["states"]
        pngs = []
        for ti, st in enumerate(states):
            png = WORK / f"{sid}-{ti}.png"
            render(page(st["body"], st.get("say", ""), scene.get("label", "")), png)
            pngs.append(png)
        print(f"rendered {sid}: {len(pngs)} picture(s)")
        if stills_only:
            continue

        narration = " ".join(st.get("say", "") for st in states if st.get("say"))
        mp3 = WORK / f"{sid}.mp3"
        asyncio.run(speak(narration, mp3))
        spoken = duration(mp3)
        total = max(spoken + 0.7, 3.2 * len(states))

        weights = [max(len(st.get("say", "")), 24) for st in states]
        shares = [total * w / sum(weights) for w in weights]
        # Each state also needs to cover the cross-fade into the next one.
        parts: list[Path] = []
        for ti, (png, share) in enumerate(zip(pngs, shares)):
            seg = WORK / f"{sid}-{ti}.mp4"
            d = share + (XFADE if ti < len(pngs) - 1 else 0)
            frames = max(int(d * FPS), 2)
            run([
                "ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(png), "-t", f"{d:.3f}",
                "-vf", f"zoompan=z='1+0.00018*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},format=yuv420p",
                "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", str(seg),
            ])
            parts.append(seg)

        # Chain the states with cross-fades.
        clip = WORK / f"{sid}.mp4"
        if len(parts) == 1:
            cur = parts[0]
        else:
            inputs, filt, last, offset = [], [], "0:v", 0.0
            for i, seg in enumerate(parts):
                inputs += ["-i", str(seg)]
            for i in range(1, len(parts)):
                offset += shares[i - 1]
                out = f"v{i}"
                filt.append(f"[{last}][{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}[{out}]")
                last = out
            cur = WORK / f"{sid}-chain.mp4"
            run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filt),
                 "-map", f"[{last}]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", str(cur)])

        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(cur), "-t", f"{total:.3f}",
             "-vf", f"fade=t=in:st=0:d={DIP},fade=t=out:st={total - DIP:.3f}:d={DIP}",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", str(clip)])

        padded = WORK / f"{sid}-pad.m4a"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-af",
             f"adelay=350|350,apad=whole_dur={total:.3f}", "-t", f"{total:.3f}", "-c:a", "aac", "-b:a", "192k", str(padded)])
        scene_videos.append(clip)
        scene_audios.append(padded)
        print(f"built {sid}: {total:.1f}s")

    if stills_only:
        return

    def concat(files: list[Path], out: Path) -> None:
        lst = WORK / (out.stem + ".txt")
        lst.write_text("".join(f"file '{f.resolve().as_posix()}'\n" for f in files), encoding="utf-8")
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out)])

    video, audio = WORK / "all-video.mp4", WORK / "all-audio.m4a"
    concat(scene_videos, video)
    concat(scene_audios, audio)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(audio), "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(OUT)])
    print(f"wrote {OUT} ({duration(OUT):.1f}s, {OUT.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--scenes", default=str(ROOT / "scenes.py"))
    ap.add_argument("--only", help="build only scenes whose id contains this text")
    a = ap.parse_args()
    ns: dict = {"__file__": str(Path(a.scenes).resolve())}
    exec(compile(Path(a.scenes).read_text(encoding="utf-8"), a.scenes, "exec"), ns)
    scenes = ns["scenes"]()
    if a.only:
        scenes = [s for s in scenes if a.only in s["id"]]
        global OUT
        OUT = WORK / "partial.mp4"
    build(scenes, a.stills)


if __name__ == "__main__":
    main()
