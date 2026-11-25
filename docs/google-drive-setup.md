# Google Drive for CSG proof photos

Photos taken on the outlet page are saved in the Google Drive of
`seedclwarehouse@gmail.com`, in the folder **SEED Warehouse - CSG proof photos**,
with one sub-folder per outlet. The dashboard makes these folders itself. It can
only see files it made (the `drive.file` permission), nothing else in that Drive.

Do these steps once.

## 1. Database

Run `prisma/sql/0009_warehouse_consignment_photos.sql` in the Supabase SQL editor.

## 2. Google Cloud (signed in as seedclwarehouse@gmail.com)

1. Open <https://console.cloud.google.com> and create a project, for example
   `SEED Warehouse`. No billing account is needed for this.
2. **APIs & Services > Library**: find **Google Drive API** and enable it.
3. **Google Auth Platform > Branding**: app name `SEED Warehouse`, and use
   `seedclwarehouse@gmail.com` for the support and developer email. Audience:
   **External**.
4. **Google Auth Platform > Audience**: choose **Publish app** so the status is
   **In production**. While it is "Testing", the sign-in stops working after 7 days.
5. **Google Auth Platform > Clients > Create client**: type **Desktop app**.
   Keep the Client ID and Client secret.

## 3. Connect

Add these two lines to `.env` in the project folder:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Then run this, open the address it prints, and sign in with the warehouse account:

```
node --env-file=.env scripts/gdrive-connect.mjs
```

If Google warns that the app is not verified, it is your own app: choose
**Advanced**, then continue. The script writes `GOOGLE_REFRESH_TOKEN` into `.env`.

## 4. Live site

In Vercel > the warehouse project > **Settings > Environment Variables**, add
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`
(Production), copying the values from `.env`, then redeploy.

Treat all three like passwords: never commit them or send them in a chat.

## If photos stop saving

"The Google Drive sign-in has expired" means the token was withdrawn (password
change, access removed, or the app was left in "Testing"). Run step 3 again and
update `GOOGLE_REFRESH_TOKEN` in Vercel.

Photos use the free storage of that Google account (15 GB, shared with its Gmail).
Each photo is resized before upload, usually to well under 1 MB.
