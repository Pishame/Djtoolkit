import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2026-02-25.clover" as any,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Spotify API Proxy
  app.get("/api/spotify/token", async (req, res) => {
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: "Spotify credentials missing in environment variables" });
      }

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      res.json(response.data);
    } catch (error: any) {
      console.error("Spotify Token Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to get Spotify token" });
    }
  });

  app.get("/api/spotify/search", async (req, res) => {
    try {
      const { q, type, token } = req.query;
      if (!token) return res.status(400).json({ error: "Token required" });

      const response = await axios.get("https://api.spotify.com/v1/search", {
        params: { q, type, limit: 1 },
        headers: { Authorization: `Bearer ${token}` },
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Spotify Search Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to search Spotify" });
    }
  });

  app.get("/api/spotify/lookup", async (req, res) => {
    try {
      const { id, type, token } = req.query;
      if (!token || !id || !type) return res.status(400).json({ error: "Token, ID, and Type required" });

      const response = await axios.get(`https://api.spotify.com/v1/${type}s/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Spotify Lookup Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to lookup Spotify ID" });
    }
  });

  // Stripe Checkout Session
  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const { planName, price, interval } = req.body;
      
      // In a real app, you'd use actual Stripe Price IDs
      // For this demo, we'll create a session with dynamic data if possible, 
      // but Stripe usually requires pre-defined prices.
      // We'll simulate the session creation.

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `DJ Toolkit Pro - ${planName}`,
              },
              unit_amount: Math.round(parseFloat(price.replace("$", "")) * 100),
              recurring: interval ? { interval: interval === "/mo" ? "month" : "year" } : undefined,
            },
            quantity: 1,
          },
        ],
        mode: interval ? "subscription" : "payment",
        success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}&upgrade=success`,
        cancel_url: `${req.headers.origin}/?upgrade=cancel`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
