# Momentum Web Push setup

1. Apply `migrations/202607160003_web_push.sql`.
2. Deploy the function:
   `supabase functions deploy send-reminders`
3. Set Edge Function secrets:
   - `VAPID_SUBJECT=mailto:your-email@example.com`
   - `VAPID_PUBLIC_KEY=BHTVKlF2QiaWSkc4d6yenfMWXKnryir4Yt9wvuGkQRpSGsIhOPTPcaDpbTPt32Er2bZDo1sLySfhK_dkE4QCE8Y`
   - `VAPID_PRIVATE_KEY=<private key supplied during setup>`
4. Run `web-push-scheduler.sql` once.

The service-role key is already available to deployed Supabase Edge Functions.
