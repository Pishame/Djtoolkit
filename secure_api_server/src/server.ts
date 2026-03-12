import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = Number(process.env.PORT || 8787);

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  })
);

const supabaseUrl = String(process.env.SUPABASE_URL || '');
const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || '');
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const stripeSecret = String(process.env.STRIPE_SECRET_KEY || '');
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

function badRequest(res: express.Response, message: string) {
  return res.status(400).json({ error: message });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dj-toolkit-secure-api' });
});

app.post('/api/auth/signin', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  if (!email || !password) return badRequest(res, 'Email and password are required.');
  if (!supabase) return res.status(501).json({ error: 'Supabase is not configured on server.' });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  return res.json({ ok: true });
});

app.post('/api/auth/signup', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  const fullName = String(req.body?.fullName || '').trim();
  if (!email || !password) return badRequest(res, 'Email and password are required.');
  if (!supabase) return res.status(501).json({ error: 'Supabase is not configured on server.' });

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ ok: true, requiresEmailVerification: true });
});

app.post('/api/auth/google/start', async (req, res) => {
  const redirectUri = String(req.body?.redirectUri || '').trim();
  if (!redirectUri) return badRequest(res, 'redirectUri is required.');
  if (!supabase) return res.status(501).json({ error: 'Supabase is not configured on server.' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUri },
  });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ url: data?.url || '' });
});

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) return spotifyTokenCache.token;
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || '');
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || '');
  if (!clientId || !clientSecret) throw new Error('Spotify credentials are missing.');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Failed to get Spotify token.');
  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, Number(data.expires_in || 3600) - 60) * 1000,
  };
  return spotifyTokenCache.token;
}

app.get('/api/spotify/token', async (_req, res) => {
  try {
    const token = await getSpotifyToken();
    return res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Spotify token error.' });
  }
});

app.get('/api/spotify/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || 'album').trim();
  if (!q) return badRequest(res, 'Query is required.');
  if (!['album', 'track'].includes(type)) return badRequest(res, 'type must be album or track.');
  try {
    const token = await getSpotifyToken();
    const params = new URLSearchParams({ q, type, limit: '5' });
    const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: 'Spotify search failed.', details: data });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Spotify search error.' });
  }
});

app.get('/api/spotify/lookup', async (req, res) => {
  const id = String(req.query.id || '').trim();
  const type = String(req.query.type || 'album').trim();
  if (!id) return badRequest(res, 'id is required.');
  if (!['album', 'track'].includes(type)) return badRequest(res, 'type must be album or track.');
  try {
    const token = await getSpotifyToken();
    const response = await fetch(`https://api.spotify.com/v1/${type}s/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: 'Spotify lookup failed.', details: data });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Spotify lookup error.' });
  }
});

const PLAN_MAP: Record<string, { name: string; amountUsdCents: number; interval?: 'month' | 'year' }> = {
  premium: { name: 'Premium', amountUsdCents: 1900, interval: 'month' },
  studio: { name: 'Studio', amountUsdCents: 4900, interval: 'month' },
};

app.post('/api/billing/create-checkout-session', async (req, res) => {
  const planId = String(req.body?.planId || '').trim().toLowerCase();
  const plan = PLAN_MAP[planId];
  if (!plan) return badRequest(res, 'Invalid planId.');
  if (!stripe) return res.status(501).json({ error: 'Stripe is not configured on server.' });

  const successUrl = String(process.env.STRIPE_SUCCESS_URL || '').trim();
  const cancelUrl = String(process.env.STRIPE_CANCEL_URL || '').trim();
  if (!successUrl || !cancelUrl) return res.status(500).json({ error: 'Stripe success/cancel URLs are missing.' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan.interval ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `DJ Toolkit Pro - ${plan.name}` },
            unit_amount: plan.amountUsdCents,
            recurring: plan.interval ? { interval: plan.interval } : undefined,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return res.json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create checkout session.' });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Server error';
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Secure API server running on http://localhost:${port}`);
});
