' Autostart target: starts the dashboard server in the background (no browser window).
Option Explicit
Dim fso, sh, dir, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\open-dashboard.ps1"" -NoBrowser"
sh.Run cmd, 0, False