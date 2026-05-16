import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  // Ensure ambassador profile exists
  let { data: amb } = await sb.from("ambassadors").select("*").eq("user_id", user.id).single();
  if (!amb) {
    const { data: profile } = await sb.from("profiles").select("name,referral_code").eq("id", user.id).single();
    const code = profile?.referral_code || (profile?.name||"USR").replace(/\s+/g,"").toUpperCase().slice(0,4) + Math.random().toString(36).slice(2,6).toUpperCase();
    const { data: newAmb } = await sb.from("ambassadors").insert({
      user_id: user.id, code, level: "bronze",
      total_sales: 0, total_earned: 0, total_referrals: 0, commission_rate: 0.05, active: true
    }).select().single();
    amb = newAmb;
  }

  // Count referrals
  const { count: totalReferrals } = await sb.from("ambassador_referrals").select("id", { count: "exact", head: true }).eq("ambassador_id", amb.id);
  const { count: paidReferrals  } = await sb.from("ambassador_referrals").select("id", { count: "exact", head: true }).eq("ambassador_id", amb.id).eq("status", "paid");

  // Cashback balance
  const { data: cashbackTxs } = await sb.from("cashback_transactions").select("amount_fcfa,status").eq("user_id", user.id);
  const cashbackAvail = (cashbackTxs||[]).filter(t=>t.status==="pending"||t.status==="credited").reduce((s,t)=>s+(t.amount_fcfa||0),0);

  // Level thresholds
  const LEVELS = { bronze:{min:0,max:49999,next:"Argent",nextMin:50000}, silver:{min:50000,max:199999,next:"Or",nextMin:200000}, gold:{min:200000,max:499999,next:"Platine",nextMin:500000}, platinum:{min:500000,max:null,next:null,nextMin:null} };
  const levelInfo = LEVELS[amb.level] || LEVELS.bronze;

  return ok({
    ...amb,
    total_referrals:    totalReferrals || 0,
    paid_referrals:     paidReferrals  || 0,
    cashback_available: cashbackAvail,
    level_info:         levelInfo,
    progress_pct: levelInfo.nextMin
      ? Math.min(100, Math.round((amb.total_earned / levelInfo.nextMin) * 100))
      : 100
  });
});
