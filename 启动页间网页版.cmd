@echo off
chcp 65001 >nul
title 页间网页版
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-web.ps1"
if errorlevel 1 pause
