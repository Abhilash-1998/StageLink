# gigZee public website (legal pages)

Static HTML for **https://gigzee.in**.

This folder is **not** the Expo mobile app. Upload these files to the web root of the server that currently serves `gigzee.in` (the host pointed at by your GoDaddy A record, currently expected to be `138.68.188.108`).

## URLs after deploy

| Path | URL |
|------|-----|
| Privacy Policy | https://gigzee.in/privacy-policy/ |
| Terms of Service | https://gigzee.in/terms-of-service/ |
| Account Deletion | https://gigzee.in/account-deletion/ |

Use trailing-slash folder URLs (`.../privacy-policy/`) so `index.html` is served by common web servers (nginx/Apache/Caddy).

## Suggested upload layout on the server

```text
/var/www/html/   (or your web root)
  index.html
  assets/styles.css
  privacy-policy/index.html
  terms-of-service/index.html
  account-deletion/index.html
```

## Example deploy (scp)

```bash
# from repo root
scp -r website/* user@138.68.188.108:/var/www/html/
```

Or ask Srinivas to copy this `website/` directory into the existing site web root.

## Google Play Console

Privacy policy URL to submit:

```text
https://gigzee.in/privacy-policy/
```

Account deletion URL (Play Console “Account deletion” / Data safety):

```text
https://gigzee.in/account-deletion/
```

## Notes

- Pages are public and require no login.
- Support email currently documented: `support@gigze.app` (from the mobile app Help screen).
- Provide a legal entity name / postal address / `privacy@gigzee.in` if you want those added before launch.
