@echo off
chcp 65001 >nul
title 卸载墨墨难词看板
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
