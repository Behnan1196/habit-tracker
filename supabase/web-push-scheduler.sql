-- Run this after deploying the send-reminders Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'momentum-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://qbfxtrtphilbsxxumfao.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiZnh0cnRwaGlsYnN4eHVtZmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDczMTYsImV4cCI6MjA5ODM4MzMxNn0.tdmuCzM7uoimgGikeKphDP85dsiW1KVtHPMSvlFeGog'
    ),
    body := '{}'::jsonb
  );
  $$
);
