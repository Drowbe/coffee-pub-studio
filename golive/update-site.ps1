# Copies the current staging site to the live site. Use it for every update after go-live.
# It never touches the live data folder (A:\coffeepub\config\data) or nginx.
# It also removes the old static privacy.html and terms.html from the live site, because nginx would
# serve those files before the new PHP versions of the same addresses.
$ErrorActionPreference = 'Stop'
$root = 'A:\coffeepub'
$bk   = "$root\plan\backup-before-golive"

foreach ($f in 'privacy.html', 'terms.html') {
  $p = "$root\site\$f"
  if ((Test-Path $p) -and -not (Test-Path "$root\staging\site\$f")) {
    if (-not (Test-Path "$bk\old-$f")) { Copy-Item $p "$bk\old-$f" }
    Remove-Item $p -Force
    Write-Host "Removed old static $f (the site now serves it from PHP). A copy is in $bk"
  }
}
# Product files moved into per-product folders. Remove the old live copies so nothing stale is left behind.
foreach ($old in 'app\content\products', 'assets\collaborator') {
  $p = "$root\site\$old"
  if (Test-Path $p) {
    $dest = "$bk\old-" + ($old -replace '\\', '-')
    if (-not (Test-Path $dest)) { Copy-Item $p $dest -Recurse }
    Remove-Item $p -Recurse -Force
    Write-Host "Removed old $old (now under products\<name>). A copy is in $bk"
  }
}
robocopy "$root\staging\site" "$root\site" /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "Copy failed (robocopy code $LASTEXITCODE)." -ForegroundColor Red; exit 1 }
Write-Host "Live site updated from staging." -ForegroundColor Green
