# Undo the go-live: restores the old site files and the old nginx config from the backup.
# Afterwards reload nginx (docker exec <container> nginx -s reload).
$ErrorActionPreference = 'Stop'
$root = 'A:\coffeepub'
$bk   = "$root\plan\backup-before-golive"
if (-not (Test-Path "$bk\site\index.html")) { Write-Host "STOP: no backup found." -ForegroundColor Red; exit 1 }

Remove-Item "$root\site\*" -Recurse -Force
Copy-Item "$bk\site\*" "$root\site" -Recurse -Force
Copy-Item "$bk\nginx\default.conf" "$root\config\nginx\site-confs\default.conf" -Force
Write-Host "Old site and old nginx config restored. Reload nginx now." -ForegroundColor Green
