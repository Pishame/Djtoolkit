@echo off
setlocal
title DJ TOOLKIT V2.1 (Diagnostics)
cd /d "%~dp0"

echo Checking tools...
echo.

where yt-dlp
yt-dlp --version
echo.

where ffmpeg
ffmpeg -version
echo.

where ffprobe
ffprobe -version
echo.

where python
python --version
echo.

where demucs
demucs --help
echo.

echo Done.
pause
