import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}`, weekday };
}

Deno.serve(async () => {
  const { data: reminders, error } = await supabase
    .from('m_reminders')
    .select('id,user_id,item_id,reminder_time,weekdays,m_items(name,description)')
    .eq('is_enabled', true);
  if (error) return new Response(error.message, { status: 500 });
  const userIds = [...new Set((reminders ?? []).map((reminder) => reminder.user_id))];
  const { data: profiles } = await supabase.from('m_profiles').select('id,timezone').in('id', userIds);
  const timeZones = new Map((profiles ?? []).map((profile) => [profile.id, profile.timezone]));

  let sent = 0;
  for (const reminder of reminders ?? []) {
    const item = Array.isArray(reminder.m_items) ? reminder.m_items[0] : reminder.m_items;
    const local = localParts(timeZones.get(reminder.user_id) || 'Europe/Istanbul');
    if (!reminder.weekdays.includes(local.weekday) || reminder.reminder_time.slice(0, 5) !== local.time) continue;

    const { data: subscriptions } = await supabase.from('m_push_subscriptions').select('*').eq('user_id', reminder.user_id);
    for (const subscription of subscriptions ?? []) {
      const delivery = { reminder_id: reminder.id, subscription_id: subscription.id, local_date: local.date, local_time: `${local.time}:00` };
      const { error: deliveryError } = await supabase.from('m_reminder_deliveries').insert(delivery);
      if (deliveryError?.code === '23505') continue;
      if (deliveryError) continue;
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({
          title: item?.name || 'Momentum',
          body: item?.description || 'Planındaki bir itemın zamanı geldi.',
          tag: `reminder-${reminder.id}-${local.date}-${local.time}`,
          url: '/',
        }));
        sent += 1;
      } catch (pushError) {
        const statusCode = (pushError as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('m_push_subscriptions').delete().eq('id', subscription.id);
        } else {
          await supabase.from('m_reminder_deliveries').delete().match(delivery);
        }
      }
    }
  }
  return Response.json({ sent });
});
