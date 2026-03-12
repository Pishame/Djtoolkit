# DJ Copyright Manager

Desktop GUI application for tracking copyright test results for `.mp3` and `.mp4` files.

## Features
- Auto-creates required folders:
  - `To_Test`
  - `Tested`
  - `Blocked`
  - `Claimed`
  - `No_Claim`
- Uses SHA256 hashes to detect already-tested files.
- Moves known hashes from `To_Test` to `Tested` during scan.
- Lets you mark new files as `Blocked`, `Claimed`, or `No_Claim`.
- Stores test results in SQLite database (`database.sqlite`).
- Displays totals and blocked percentage.
- Includes a 90+ day re-check view (`Show Old Files`).

## Run
```powershell
python -m pip install -r requirements.txt
python app.py
```

## Run (PySide6 Modern UI)
```powershell
python -m pip install -r requirements.txt
python app_pyside.py
```

`app.py` launches the PySide6 app by default.
Legacy CustomTkinter entrypoint has been removed.

## Build EXE (PyInstaller)
```powershell
python -m pip install pyinstaller
pyinstaller --noconfirm --onefile --windowed --name "DJ Copyright Manager" app.py
```

Generated executable is in `dist/`.

## Stitch MCP Integration (Read-Only, Manual Sync)
Stitch exports are stored in:
- `design/stitch_exports/`

Install Stitch MCP server deps:
```powershell
python -m pip install -r integrations/stitch_mcp/requirements.txt
```

Set env vars:
- `STITCH_API_BASE_URL`
- `STITCH_API_KEY`

Run local MCP server:
```powershell
python -m integrations.stitch_mcp.server
```

See full integration docs:
- `integrations/stitch_mcp/README.md`
