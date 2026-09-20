@echo off
chcp 65001 >nul
rem 免安装快速预览：以 Edge 应用模式打开（无任何依赖）

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if not exist "%EDGE%" (
    echo 未检测到 Microsoft Edge。
    echo 请直接用任意现代浏览器打开 web\index.html 即可。
    pause
    exit /b 1
)

start "" "%EDGE%" --app="%~dp0web\index.html" --window-size=1440,900 --allow-file-access-from-files
