# Copies the admin tool (set-admin.php) to the live config folder. Does not change the website.
Copy-Item 'A:\coffeepub\staging\tools\set-admin.php' 'A:\coffeepub\config\tools\set-admin.php' -Force
Write-Host 'set-admin.php updated.' -ForegroundColor Green
