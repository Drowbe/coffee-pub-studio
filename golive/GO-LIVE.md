# Go-live, step by step

Nothing here has been applied. The scripts in this folder do the file work; the three container commands you run yourself.
Replace NAME with your nginx container's name (step 1). If you use the Container Station terminal inside the container, leave out `docker exec NAME` (and `-it`).

1. On the NAS (SSH): `docker ps`  -> note the container name.
2. `docker exec NAME php -m`  -> must list curl, pdo_sqlite, mbstring, openssl, json. If one is missing, stop.
3. `docker exec -it NAME sh -c 'printf "admin:$(openssl passwd -apr1)\n" > /config/nginx/.htpasswd'`  -> type a password twice. Save it. This is the FIRST admin login.
4. Windows PowerShell: `powershell -ExecutionPolicy Bypass -File A:\coffeepub\staging\golive\1-prepare.ps1`  (backs up, installs new nginx config; site unchanged).
5. `docker exec NAME nginx -t` (must say "test is successful"), then `docker exec NAME nginx -s reload`. Check https://coffeepub.ai/ still shows the OLD page.
6. Windows PowerShell: `powershell -ExecutionPolicy Bypass -File A:\coffeepub\staging\golive\2-publish.ps1`  -> NEW SITE IS LIVE.
7. Check: /, /products, /products/squire, /about, /support, /contact, /design-system load; /app/src/bootstrap.php is 403; /privacy.html and /terms.html load.
8. `docker exec -it NAME php /config/tools/set-admin.php YOURNAME --out /config/tools/admin-password.txt`  -> open A:\coffeepub\config\tools\admin-password.txt, save the password, delete the file. This is the SECOND admin login.
9. Send a test message at /contact, open /admin (both logins), find it.
10. Google Cloud console: OAuth consent screen homepage is still https://coffeepub.ai/ (the home page still describes the Showrunner app and its optional YouTube upload).

Undo: `powershell -ExecutionPolicy Bypass -File A:\coffeepub\staging\golive\3-rollback.ps1`, then `docker exec NAME nginx -s reload`.
