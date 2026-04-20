const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
app.use(cors());

// ── Webhook de Stripe necesita el body RAW ───────────────────
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Ruta de prueba ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('✅ Backend MARIBEGO funcionando correctamente');
});

// ── Crear sesión de Stripe Checkout ─────────────────────────
app.post('/crear-sesion', async (req, res) => {
  try {
    const { items, customer_email, metadata, success_url, cancel_url } = req.body;

    const line_items = items.map(item => ({
      price_data: {
        currency: 'mxn',
        product_data: { name: item.name },
        unit_amount: item.amount,
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

// ── Webhook de Stripe (para emails automáticos) ──────────────
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata || {};
    const total = (session.amount_total / 100).toFixed(2);

    // Email al cliente
    if (session.customer_email) {
      await sendEmail({
        to: session.customer_email,
        subject: `✦ Confirmación de tu pedido MARIBEGO — ${meta.orden_id}`,
        html: emailCliente({ ...meta, total, email: session.customer_email }),
      });
    }

    // Email a la manager
    await sendEmail({
      to: process.env.MANAGER_EMAIL || 'begoaran91@gmail.com',
      subject: `🎂 Nuevo pedido MARIBEGO — ${meta.orden_id} — $${total} MXN`,
      html: emailManager({ ...meta, total, email: session.customer_email }),
    });
  }

  res.json({ received: true });
});

// ── Enviar email con Resend ──────────────────────────────────
async function sendEmail({ to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MARIBEGO <info@maribego.com>',
        to,
        subject,
        html,
      }),
    });
    const data = await res.json();
    console.log('Email enviado:', data.id || data);
  } catch (err) {
    console.error('Error email:', err.message);
  }
}

// ── Template email cliente ───────────────────────────────────
function emailCliente({ orden_id, nombre, fecha_entrega, horario, tipo_entrega, direccion, total }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin:0;padding:0;background:#f9f2e8;font-family:'Georgia',serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f2e8;padding:40px 20px;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:#3d2e26;padding:36px 40px;text-align:center;">
              <p style="margin:0;color:#f0ce99;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">Pasteles de Merengue</p>
              <h1 style="margin:8px 0 0;color:#f9f2e8;font-size:32px;font-weight:400;letter-spacing:0.05em;">MARIBEGO</h1>
            </td>
          </tr>

          <!-- Saludo -->
          <tr>
            <td style="padding:36px 40px 0;">
              <p style="margin:0;color:#3d2e26;font-size:18px;">Hola ${nombre ? nombre.split(' ')[0] : 'cliente'} ✦</p>
              <p style="margin:12px 0 0;color:#6b5c52;font-size:15px;line-height:1.6;">
                Tu pedido ha sido confirmado y estamos preparando algo especial para ti. 
                Aquí tienes el resumen de tu pedido:
              </p>
            </td>
          </tr>

          <!-- Resumen pedido -->
          <tr>
            <td style="padding:24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e1d5c9;border-radius:6px;overflow:hidden;">
                <tr style="background:#f9f2e8;">
                  <td style="padding:12px 16px;color:#9b8d81;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Detalle</td>
                  <td style="padding:12px 16px;color:#9b8d81;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;text-align:right;">Info</td>
                </tr>
                <tr style="border-top:1px solid #e1d5c9;">
                  <td style="padding:12px 16px;color:#6b5c52;font-size:13px;">Número de pedido</td>
                  <td style="padding:12px 16px;color:#3d2e26;font-size:13px;font-weight:bold;text-align:right;">${orden_id || '—'}</td>
                </tr>
                <tr style="border-top:1px solid #e1d5c9;background:#fafafa;">
                  <td style="padding:12px 16px;color:#6b5c52;font-size:13px;">Fecha de entrega</td>
                  <td style="padding:12px 16px;color:#3d2e26;font-size:13px;text-align:right;">${fecha_entrega || '—'}</td>
                </tr>
                <tr style="border-top:1px solid #e1d5c9;">
                  <td style="padding:12px 16px;color:#6b5c52;font-size:13px;">Horario</td>
                  <td style="padding:12px 16px;color:#3d2e26;font-size:13px;text-align:right;">${horario || '—'}</td>
                </tr>
                <tr style="border-top:1px solid #e1d5c9;background:#fafafa;">
                  <td style="padding:12px 16px;color:#6b5c52;font-size:13px;">${tipo_entrega === 'tienda' ? 'Recoger en' : 'Dirección'}</td>
                  <td style="padding:12px 16px;color:#3d2e26;font-size:13px;text-align:right;">${direccion || '—'}</td>
                </tr>
                <tr style="border-top:2px solid #f0ce99;background:#fffcf5;">
                  <td style="padding:14px 16px;color:#3d2e26;font-size:15px;font-weight:bold;">Total pagado</td>
                  <td style="padding:14px 16px;color:#b8903e;font-size:18px;font-weight:bold;text-align:right;">$${total} MXN</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Recomendaciones -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f3;border-left:4px solid #78cfa3;border-radius:4px;padding:16px 20px;">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;color:#3d2e26;font-size:13px;font-weight:bold;">🌿 Para disfrutarlo al máximo</p>
                    <p style="margin:0;color:#6b5c52;font-size:13px;line-height:1.7;">
                      Te recomendamos consumir tu pastel de merengue <strong>el mismo día de entrega o al día siguiente</strong> para garantizar su frescura y textura perfecta.<br><br>
                      Si necesitas guardarlo, introdúcelo en el <strong>refrigerador</strong> sin cubrir (para proteger el merengue) y sácalo 15 minutos antes de servir.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 36px;text-align:center;">
              <p style="margin:0 0 16px;color:#6b5c52;font-size:13px;">¿Tienes alguna pregunta? Escríbenos por WhatsApp:</p>
              <a href="https://wa.me/5215514743302" style="display:inline-block;background:#3d2e26;color:#f9f2e8;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">Contactar por WhatsApp</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f2e8;padding:20px 40px;text-align:center;border-top:1px solid #e1d5c9;">
              <p style="margin:0;color:#9b8d81;font-size:11px;line-height:1.6;">
                MARIBEGO · Pasteles de Merengue · CDMX<br>
                info@maribego.com · maribego.com
              </p>
            </td>
          </tr>

        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

// ── Template email manager ───────────────────────────────────
function emailManager({ orden_id, nombre, tel, email, fecha_entrega, horario, tipo_entrega, direccion, total }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:20px;background:#f9f2e8;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:2px solid #f0ce99;">
      <tr>
        <td style="background:#3d2e26;padding:20px 30px;">
          <h2 style="margin:0;color:#f0ce99;font-size:20px;">🎂 Nuevo Pedido MARIBEGO</h2>
          <p style="margin:4px 0 0;color:#e1d5c9;font-size:13px;">Se acaba de confirmar un pago con Stripe</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 30px;">
          <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
            <tr style="background:#f9f2e8;"><td colspan="2" style="padding:10px 12px;font-weight:bold;color:#3d2e26;font-size:13px;">📋 DATOS DEL PEDIDO</td></tr>
            <tr style="border-top:1px solid #e1d5c9;"><td style="color:#9b8d81;font-size:13px;width:40%;">Pedido #</td><td style="color:#3d2e26;font-weight:bold;font-size:13px;">${orden_id}</td></tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="color:#9b8d81;font-size:13px;">Total</td><td style="color:#b8903e;font-weight:bold;font-size:16px;">$${total} MXN</td></tr>
            <tr style="border-top:1px solid #e1d5c9;"><td style="color:#9b8d81;font-size:13px;">Fecha entrega</td><td style="color:#3d2e26;font-size:13px;">${fecha_entrega}</td></tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="color:#9b8d81;font-size:13px;">Horario</td><td style="color:#3d2e26;font-size:13px;">${horario}</td></tr>
            <tr style="border-top:1px solid #e1d5c9;"><td style="color:#9b8d81;font-size:13px;">Entrega</td><td style="color:#3d2e26;font-size:13px;">${tipo_entrega === 'tienda' ? '🏪 Recoger en tienda' : '🏠 Domicilio'}</td></tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="color:#9b8d81;font-size:13px;">Dirección</td><td style="color:#3d2e26;font-size:13px;">${direccion}</td></tr>
            <tr style="border-top:2px solid #e1d5c9;"><td style="color:#9b8d81;font-size:13px;padding-top:16px;">📱 CLIENTE</td><td></td></tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="color:#9b8d81;font-size:13px;">Nombre</td><td style="color:#3d2e26;font-size:13px;">${nombre}</td></tr>
            <tr style="border-top:1px solid #e1d5c9;"><td style="color:#9b8d81;font-size:13px;">WhatsApp</td><td><a href="https://wa.me/52${tel}" style="color:#25D366;font-size:13px;">${tel}</a></td></tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="color:#9b8d81;font-size:13px;">Email</td><td style="color:#3d2e26;font-size:13px;">${email}</td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#f9f2e8;padding:16px 30px;text-align:center;border-top:1px solid #e1d5c9;">
          <p style="margin:0;color:#9b8d81;font-size:11px;">Este es un correo automático generado al confirmar el pago en Stripe.</p>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MARIBEGO backend corriendo en puerto ${PORT}`));
