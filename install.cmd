@echo off
chcp 65001 >nul
title 安装墨墨难词看板
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"