DJ TOOLKIT V2.5 (PowerShell)
===========================
DJ TOOLKIT V2.5 (PowerShell)
===========================

Run
- Double-click `RUN_DJ_TOOLKIT_V2.cmd` or run `DJ_TOOLKIT_V2.ps1` in PowerShell.

Settings
- Saved to `config.json` (script folder).
- `AutoOpenOutputFolder`: open output folder after actions.
- `DefaultClipLengthSec` / `DefaultClipSection`: defaults for copyright builder.
- `OutputMode`:
  - `SameFolder`: merged output saved next to selected MP4s.
  - `DJDownloads`: merged output saved to `Downloads\DJDownloads`.

Copyright builder
- Choose clip length: 15 / 30 / 60 / custom.
- Choose section: Start / Middle / End.
- Outputs use indexed names and do not overwrite (e.g. `_01`, `_02`).

Optional extras (enable in Settings)
- Demucs stems: `pip install demucs` (works if `demucs` command or `python -m demucs` is available).
- BPM detect: `pip install aubio` (requires `aubio` available).

Logs
- `DJ_TOOLKIT_V2.log` in the tools folder.

Notes
- Merging: the toolkit will try a fast concat (stream copy). If clips are not codec-compatible it will fall back to a re-encode (slower but reliable).

- Downloads: the toolkit shows an inline progress indicator while `yt-dlp` runs so you can see activity.
- Copyright builder: you can choose to compress the final merged clip to 720p (prompted when creating clips).

Troubleshooting
- If option [1] (ydlq) loops or reports "yt-dlp failed":
  - Update yt-dlp: run `yt-dlp -U`.
  - Signature/JS errors: install a JavaScript runtime (Node.js or Deno) so yt-dlp can solve YouTube JS challenges.
  - Test before downloading: run a simulated run:
    - `yt-dlp --simulate -o "%(uploader)s - %(title)s.%(ext)s" -f "137+140" <VIDEO_URL>`
  - If download still fails, run the toolkit and copy the yt-dlp output shown by the script (it captures the last output on failure).
- DJ_TOOLKIT_V2.log in tools folder

