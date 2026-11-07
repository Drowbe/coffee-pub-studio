# Step 1 of the go-live. Changes NOTHING on the live website.
# It backs up the current site and nginx config, copies the admin tool outside the web root,
# and puts the new nginx config in place (nginx only uses it after you reload it).
$ErrorActionPreference = 'Stop'
$root   = 'A:\coffeepub'
$bk     = "$root\plan\backup-before-golive"
$conf   = "$root\config\nginx\site-confs\default.conf"
$newcnf = "$root\staging\golive\default.conf"

if (-not (Test-Path "$root\config\nginx\.htpasswd")) {
  Write-Host "STOP: $root\config\nginx\.htpasswd does not exist yet." -ForegroundColor Red
  Write-Host "Do the 'create the admin password file' command from GO-LIVE.md first, then run this again."
  exit 1
}
if (Test-Path $bk) { Write-Host "STOP: $bk already exists. Rename or delete it first so no backup is overwritten." -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force "$bk\site", "$bk\nginx" | Out-Null
Copy-Item "$root\site\*" "$bk\site" -Recurse -Force
Copy-Item $conf "$bk\nginx\default.conf" -Force
Write-Host "Backed up the live site and nginx config to $bk"

New-Item -ItemType Directory -Force "$root\config\tools" | Out-Null
Copy-Item "$root\staging\tools\set-admin.php" "$root\config\tools\set-admin.php" -Force
Write-Host "Copied set-admin.php to $root\config\tools"

Copy-Item $newcnf $conf -Force
Write-Host "Installed the new nginx config. It is NOT active until you reload nginx (GO-LIVE.md step 5)." -ForegroundColor Green
