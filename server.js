const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── Ruta de prueba ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('✅ Backend MARIBEGO funcionando correctamente');
});

// ── Crear sesión de Stripe Checkout ─────────────────────────
app.post('/crear-sesion', async (req, res) => {
  try {
    const { items, customer_email, metadata, success_url, cancel_url } = req.body;

    // Convertir items al formato que espera Stripe
    const line_items = items.map(item => ({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: item.name,
        },
        unit_amount: item.amount, // Ya viene en centavos desde el frontend
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      customer_email,
      metadata,
      success_url,
      cancel_url,
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error('Error Stripe:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MARIBEGO backend corriendo en puerto ${PORT}`));
