// Turn a raw client video delivery into the web encodes the site ships.
//
// The client delivers masters (the "Rizal as an Artist" AVP arrives as 4K,
// 1.19 GB) — far too heavy to serve and far too heavy to commit. This script
// produces the two rungs the video dialog chooses between:
//
//   <name>-1080p.mp4   1920x1080, H.264 high, CRF 22 capped at 2.6 Mbps
//   <name>-720p.mp4    1280x720,  H.264 high, CRF 23 capped at 1.4 Mbps
//
// Both rungs are encoded from the master rather than 720p from the 1080p, so
// the small rung is a clean downscale of the original and not a re-compression
// of an already-compressed frame. The 720p settings match the museum origin's
// own intro AVP (1280x720 at ~1.03 Mbps video + 128k audio), so the two hero
// videos sit at the same quality and the pair reads as one piece of work.
//
// Why two rungs and not adaptive streaming: a plain `<video>` with several
// `<source>` children does NOT pick by bandwidth — the browser takes the first
// source it can decode, and both rungs are H.264/MP4, so it would always take
// the 1080p. Real bitrate adaptation needs HLS/DASH plus a JS player, which
// this site does not carry. So js/main.js picks the rung from the viewer's
// screen instead: a device that cannot show more than 720p never pulls the
// 1080p file. That is where the saving actually lands (a phone skips ~45 MB).
//
// `-movflags +faststart` puts the moov atom first so playback starts before
// the file has arrived — the whole point for a 6½-minute video opened from a
// dialog. `-g 48` with `-sc_threshold 0` fixes a keyframe every 2s at 23.976
// fps, which keeps seeking responsive.
//
// Usage:
//   node scripts/video/web-encode.mjs <master> <out-dir> <basename> [--only 720|1080]
//
// Example (both rungs, as shipped):
//   node scripts/video/web-encode.mjs \
//     "NEW-ASSETS /Rizal as an Artist AVP.mp4" static/video rizal-as-an-artist
//
// Output goes straight to static/video/ (build.js copies static/ into dist
// verbatim). Unlike the image pipeline there is no assets-src step: these files
// need no build-time derivation, so the committed file is the shipped file.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

/** The ladder. `maxrate`/`bufsize` cap the peaks CRF alone would let through,
 *  which is what keeps a 6½-minute file predictable in size. */
const RUNGS = {
  1080: {
    scale: "1920:1080",
    crf: 22,
    maxrate: "2600k",
    bufsize: "5200k",
    level: "4.0",
  },
  720: {
    scale: "1280:720",
    crf: 23,
    maxrate: "1400k",
    bufsize: "2800k",
    level: "3.1",
  },
};

const AUDIO = ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"];

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const only = onlyAt === -1 ? null : args[onlyAt + 1];
const [master, outDir, basename] = args.filter(
  (a, i) => !a.startsWith("--") && i !== onlyAt + 1,
);

if (!master || !outDir || !basename) {
  console.error(
    "usage: node scripts/video/web-encode.mjs <master> <out-dir> <basename> [--only 720|1080]",
  );
  process.exit(1);
}
if (only && !RUNGS[only]) {
  console.error(`--only must be one of ${Object.keys(RUNGS).join(", ")}`);
  process.exit(1);
}

/** @param {string[]} argv */
function ffmpeg(argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", argv, { stdio: ["ignore", "inherit", "inherit"] });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(undefined) : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

mkdirSync(outDir, { recursive: true });

for (const [height, rung] of Object.entries(RUNGS)) {
  if (only && only !== height) continue;
  const out = path.join(outDir, `${basename}-${height}p.mp4`);
  console.log(`\n→ ${out}`);
  await ffmpeg([
    "-y", "-hide_banner", "-loglevel", "warning", "-stats",
    "-i", master,
    // lanczos rather than the default bicubic: these are 4K masters coming down
    // to a third of their size, where the sharper kernel is visible on text.
    "-vf", `scale=${rung.scale}:flags=lanczos`,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(rung.crf),
    "-maxrate", rung.maxrate, "-bufsize", rung.bufsize,
    "-profile:v", "high", "-level", rung.level, "-pix_fmt", "yuv420p",
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    ...AUDIO,
    "-movflags", "+faststart",
    out,
  ]);
}

console.log("\ndone");
