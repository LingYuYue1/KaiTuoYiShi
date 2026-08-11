@echo off
chcp 65001 >nul
title 开拓轶事 - 网页本地开发

cd /d "%~dp0"

echo ========================================
echo   开拓轶事 - 网页本地开发环境
echo ========================================
echo.
echo 当前目录：%cd%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm，请先安装 Node.js。
  echo 下载地址：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [提示] 未找到 node_modules。
  echo 请先在本目录运行：npm install
  echo.
  pause
  exit /b 1
)

echo 正在启动 Vite 本地开发服务器...
echo 启动成功后，请按终端提示打开本地地址。
echo 按 Ctrl+C 可以停止服务器。
echo.

npm run dev

echo.
echo 开发服务器已停止。
pause