@echo off
echo Copying RemiAI assets from main app to website...
echo.

set SRC=..\public
set DST=public

echo === Logos ===
copy "%SRC%\RemiAI.png" "%DST%\RemiAI.png" /Y
copy "%SRC%\RemiAI-Light.png" "%DST%\RemiAI-Light.png" /Y
copy "%SRC%\RemiAI-Lighter.png" "%DST%\RemiAI-Lighter.png" /Y

echo.
echo === Favicons ===
copy "%SRC%\favicon.ico" "%DST%\favicon.ico" /Y
copy "%SRC%\favicon-Light.ico" "%DST%\favicon-Light.ico" /Y
copy "%SRC%\favicon-16x16.png" "%DST%\favicon-16x16.png" /Y
copy "%SRC%\favicon-16x16-Light.png" "%DST%\favicon-16x16-Light.png" /Y
copy "%SRC%\favicon-16x16-Lighter.png" "%DST%\favicon-16x16-Lighter.png" /Y
copy "%SRC%\favicon-32x32.png" "%DST%\favicon-32x32.png" /Y
copy "%SRC%\favicon-32x32-Light.png" "%DST%\favicon-32x32-Light.png" /Y
copy "%SRC%\favicon-32x32-Lighter.png" "%DST%\favicon-32x32-Lighter.png" /Y
copy "%SRC%\favicon-48x48.png" "%DST%\favicon-48x48.png" /Y
copy "%SRC%\favicon-48x48-Light.png" "%DST%\favicon-48x48-Light.png" /Y
copy "%SRC%\favicon-48x48-Lighter.png" "%DST%\favicon-48x48-Lighter.png" /Y

echo.
echo === Manifest ===
copy "%SRC%\manifest.json" "%DST%\manifest.json" /Y

echo.
echo Done! All assets copied.
dir "%DST%\RemiAI*" "%DST%\favicon*" "%DST%\manifest.json" 2>nul
