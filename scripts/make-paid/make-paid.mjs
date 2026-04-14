#!/usr/bin/env node
/**
 * Upgrade an org to the pro (paid) plan.
 *
 * Usage (from the scripts/make-paid folder):
 *   node make-paid.mjs --email user@example.com
 *   node make-paid.mjs --org-id <uuid>
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment.
 * You can source apps/web/.env.local or pass them inline:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node make-paid.mjs --email ...
 */

import { createClient } from '@supabase/supabase-js';

// ── env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Error: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.'
  );
  process.exit(1);
}

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
const orgIdx = args.indexOf('--org-id');

const email = emailIdx !== -1 ? args[emailIdx + 1] : null;
const orgId = orgIdx !== -1 ? args[orgIdx + 1] : null;

if (!email && !orgId) {
  console.error('Usage: node scripts/make-paid.mjs --email <email>');
  console.error('       node scripts/make-paid.mjs --org-id <uuid>');
  process.exit(1);
}

// ── supabase admin client ─────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  let resolvedOrgId = orgId;

  // Resolve org from email if needed
  if (email) {
    console.log(`Looking up user by email: ${email}`);

    // Find auth user by email
    const { data: usersData, error: usersError } =
      await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    const user = usersData.users.find((u) => u.email === email);
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
    console.log(`Found user: ${user.id}`);

    // Find org membership
    const { data: membership, error: membershipError } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (membershipError || !membership) {
      console.error(`No org found for user ${user.id}:`, membershipError?.message);
      process.exit(1);
    }

    resolvedOrgId = membership.org_id;
    console.log(`Resolved org_id: ${resolvedOrgId}`);
  }

  // Fetch current subscription
  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('org_id', resolvedOrgId)
    .single();

  if (subError || !sub) {
    console.error(`No subscription found for org ${resolvedOrgId}:`, subError?.message);
    process.exit(1);
  }

  console.log(`Current subscription: plan=${sub.plan}, status=${sub.status}`);

  if (sub.plan === 'pro' && sub.status === 'active') {
    console.log('Account is already on the pro plan and active. Nothing to do.');
    process.exit(0);
  }

  // Upgrade to pro
  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      plan: 'pro',
      status: 'active',
      billing_period: sub.billing_period ?? 'yearly',
      current_period_start: now,
      current_period_end: periodEnd,
      cancelled_at: null,
      updated_at: now,
    })
    .eq('org_id', resolvedOrgId);

  if (updateError) {
    console.error('Failed to update subscription:', updateError.message);
    process.exit(1);
  }

  console.log(`\nDone! org ${resolvedOrgId} is now on the pro plan.`);
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
