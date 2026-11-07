# Step 2 of the go-live. THIS PUTS THE NEW SITE LIVE.
# Run it only after nginx has been reloaded with the new config (GO-LIVE.md step 5 passed).
$ErrorActionPreference = 'Stop'
$root = 'A:\coffeepub'
$bk   = "$root\plan\backup-before-golive"

if (-not (Test-Path "$bk\site\index.html")) { Write-Host "STOP: no backup found. Run 1-prepare.ps1 first." -ForegroundColor Red; exit 1 }

# Move the old page files out of the web root so the old index.html stops winning.
foreach ($f in 'index.html', 'style.css', 'icon.png') {
  if (Test-Path "$root\site\$f") { Move-Item "$root\site\$f" "$bk\old-$f" -Force }
}
# Copy the new site. /E copies sub-folders; nothing is deleted.
robocopy "$root\staging\site" "$root\site" /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "Copy failed (robocopy code $LASTEXITCODE)." -ForegroundColor Red; exit 1 }
Write-Host "The new site is copied to $root\site." -ForegroundColor Green
Write-Host "Now open https://coffeepub.ai/ and follow the checks in GO-LIVE.md."
Write-Host "To undo: run 3-rollback.ps1."
