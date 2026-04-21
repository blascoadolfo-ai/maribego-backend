const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
 
const app = express();
app.use(cors());
 
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
 
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
 
// ── Webhook de Stripe ────────────────────────────────────────
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
 
    // Build line items list from Stripe
    let lineItems = [];
    try {
      const itemsData = await stripe.checkout.sessions.listLineItems(session.id);
      lineItems = itemsData.data.map(i => ({
        name: i.description,
        qty: i.quantity,
        amount: (i.amount_total / 100).toFixed(2),
      }));
    } catch(e) {
      console.error('Could not fetch line items:', e.message);
    }
 
    const emailTo = meta.email || session.customer_email;
 
    // Email al cliente
    if (emailTo) {
      await sendEmail({
        to: emailTo,
        subject: `✦ Confirmación de tu pedido MARIBEGO — ${meta.orden_id}`,
        html: emailCliente({ ...meta, total, email: emailTo, lineItems }),
      });
    }
 
    // Email a la manager
    await sendEmail({
      to: process.env.MANAGER_EMAIL || 'begoaran91@gmail.com',
      subject: `🎂 Nuevo pedido — ${meta.orden_id} — $${total} MXN`,
      html: emailManager({ ...meta, total, email: emailTo, lineItems }),
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
    console.log('Email enviado:', data.id || JSON.stringify(data));
  } catch (err) {
    console.error('Error email:', err.message);
  }
}
 
// ── Template email CLIENTE ───────────────────────────────────
function emailCliente({ orden_id, nombre, fecha_entrega, horario, tipo_entrega, direccion, refs, items, notas, total, lineItems }) {
  const entregaLabel = tipo_entrega === 'tienda' ? 'Recoger en tienda' : 'Entrega a domicilio';
 
  const itemsRows = lineItems && lineItems.length > 0
    ? lineItems.map((item, i) => `
      <tr style="border-top:1px solid #e1d5c9;${i % 2 === 0 ? '' : 'background:#fafafa'}">
        <td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${item.name}${item.qty > 1 ? ` × ${item.qty}` : ''}</td>
        <td style="padding:10px 16px;color:#3d2e26;font-size:13px;text-align:right;font-weight:600;">$${item.amount} MXN</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px 16px;color:#9b8d81;font-size:13px;">${items || '—'}</td></tr>`;
 
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f2e8;font-family:'Georgia',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f2e8;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
 
      <!-- Header -->
      <tr>
        <td style="background:#3d2e26;padding:32px 40px;text-align:center;">
          <p style="margin:0;color:#f0ce99;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">Pasteles de Merengue</p>
          <h1 style="margin:8px 0 0;color:#f9f2e8;font-size:28px;font-weight:400;letter-spacing:0.05em;">MARIBEGO</h1>
        </td>
      </tr>
 
      <!-- Saludo -->
      <tr>
        <td style="padding:32px 40px 16px;">
          <p style="margin:0;color:#3d2e26;font-size:17px;">Hola ${nombre ? nombre.split(' ')[0] : 'cliente'} ✦</p>
          <p style="margin:10px 0 0;color:#6b5c52;font-size:14px;line-height:1.6;">
            Tu pedido ha sido confirmado y pagado. Aquí tienes el resumen completo:
          </p>
        </td>
      </tr>
 
      <!-- Productos -->
      <tr>
        <td style="padding:0 40px 8px;">
          <p style="margin:0 0 8px;color:#9b8d81;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;font-family:'Montserrat',sans-serif;">Lo que pediste</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e1d5c9;border-radius:6px;overflow:hidden;">
            <tr style="background:#f9f2e8;">
              <td style="padding:10px 16px;color:#9b8d81;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;">Producto</td>
              <td style="padding:10px 16px;color:#9b8d81;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;text-align:right;">Precio</td>
            </tr>
            ${itemsRows}
            <tr style="border-top:2px solid #f0ce99;background:#fffcf5;">
              <td style="padding:12px 16px;color:#3d2e26;font-size:14px;font-weight:bold;">Total pagado</td>
              <td style="padding:12px 16px;color:#b8903e;font-size:17px;font-weight:bold;text-align:right;">$${total} MXN</td>
            </tr>
          </table>
        </td>
      </tr>
 
      <!-- Detalles de entrega -->
      <tr>
        <td style="padding:16px 40px 8px;">
          <p style="margin:0 0 8px;color:#9b8d81;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;font-family:'Montserrat',sans-serif;">Detalles de entrega</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e1d5c9;border-radius:6px;overflow:hidden;">
            <tr>
              <td style="padding:10px 16px;color:#6b5c52;font-size:13px;width:40%;">Pedido #</td>
              <td style="padding:10px 16px;color:#3d2e26;font-size:13px;font-weight:bold;">${orden_id || '—'}</td>
            </tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;">
              <td style="padding:10px 16px;color:#6b5c52;font-size:13px;">Tipo</td>
              <td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${entregaLabel}</td>
            </tr>
            <tr style="border-top:1px solid #e1d5c9;">
              <td style="padding:10px 16px;color:#6b5c52;font-size:13px;">${tipo_entrega === 'tienda' ? 'Tienda' : 'Dirección'}</td>
              <td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${direccion || '—'}</td>
            </tr>
            <tr style="border-top:1px solid #e1d5c9;background:#fafafa;">
              <td style="padding:10px 16px;color:#6b5c52;font-size:13px;">Fecha</td>
              <td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${fecha_entrega || '—'}</td>
            </tr>
            <tr style="border-top:1px solid #e1d5c9;">
              <td style="padding:10px 16px;color:#6b5c52;font-size:13px;">Horario</td>
              <td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${horario || '—'}</td>
            </tr>
            ${refs ? `<tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="padding:10px 16px;color:#6b5c52;font-size:13px;">Referencias</td><td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${refs}</td></tr>` : ''}
            ${notas ? `<tr style="border-top:1px solid #e1d5c9;"><td style="padding:10px 16px;color:#6b5c52;font-size:13px;">Extras</td><td style="padding:10px 16px;color:#3d2e26;font-size:13px;">${notas}</td></tr>` : ''}
          </table>
        </td>
      </tr>
 
      <!-- Recomendaciones -->
      <tr>
        <td style="padding:16px 40px 24px;">
          <table width="100%" cellpadding="16" cellspacing="0" style="background:#f0f7f3;border-left:4px solid #78cfa3;border-radius:4px;">
            <tr><td>
              <p style="margin:0 0 6px;color:#3d2e26;font-size:13px;font-weight:bold;">🌿 Para disfrutarlo al máximo</p>
              <p style="margin:0;color:#6b5c52;font-size:13px;line-height:1.7;">
                Te recomendamos consumir tu pastel <strong>el mismo día de entrega o al día siguiente</strong> para garantizar su frescura y textura perfecta.<br><br>
                Si necesitas guardarlo, introdúcelo en el <strong>refrigerador sin cubrir</strong> y sácalo 15 minutos antes de servir.
              </p>
            </td></tr>
          </table>
        </td>
      </tr>
 
      <!-- CTA WhatsApp -->
      <tr>
        <td style="padding:0 40px 32px;text-align:center;">
          <p style="margin:0 0 14px;color:#6b5c52;font-size:13px;">¿Tienes alguna pregunta? Escríbenos:</p>
          <a href="https://wa.me/5215514743302" style="display:inline-block;background:#3d2e26;color:#f9f2e8;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:'Montserrat',sans-serif;">Contactar por WhatsApp</a>
        </td>
      </tr>
 
      <!-- Footer -->
      <tr>
        <td style="background:#f9f2e8;padding:18px 40px;text-align:center;border-top:1px solid #e1d5c9;">
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
 
// ── Template email MANAGER ───────────────────────────────────
function emailManager({ orden_id, nombre, tel, email, fecha_entrega, horario, tipo_entrega, direccion, refs, items, notas, total, lineItems }) {
  const entregaLabel = tipo_entrega === 'tienda' ? '🏪 Recoger en tienda' : '🏠 Entrega a domicilio';
 
  const itemsRows = lineItems && lineItems.length > 0
    ? lineItems.map(item => `
      <tr style="border-top:1px solid #e1d5c9;">
        <td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${item.name}${item.qty > 1 ? ` × ${item.qty}` : ''}</td>
        <td style="padding:8px 12px;color:#3d2e26;font-size:13px;text-align:right;font-weight:600;">$${item.amount} MXN</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:8px 12px;color:#9b8d81;font-size:13px;">${items || '—'}</td></tr>`;
 
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f9f2e8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:2px solid #f0ce99;">
 
  <!-- Header -->
  <tr>
    <td style="background:#3d2e26;padding:20px 28px;">
      <h2 style="margin:0;color:#f0ce99;font-size:18px;">🎂 Nuevo Pedido MARIBEGO</h2>
      <p style="margin:4px 0 0;color:#e1d5c9;font-size:12px;">Pago confirmado · ${new Date().toLocaleString('es-MX')}</p>
    </td>
  </tr>
 
  <!-- Productos -->
  <tr>
    <td style="padding:20px 28px 8px;">
      <p style="margin:0 0 8px;color:#9b8d81;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">PRODUCTOS</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1d5c9;border-radius:4px;overflow:hidden;">
        ${itemsRows}
        <tr style="border-top:2px solid #f0ce99;background:#fffcf5;">
          <td style="padding:10px 12px;color:#3d2e26;font-size:14px;font-weight:bold;">TOTAL</td>
          <td style="padding:10px 12px;color:#b8903e;font-size:16px;font-weight:bold;text-align:right;">$${total} MXN</td>
        </tr>
      </table>
    </td>
  </tr>
 
  <!-- Entrega -->
  <tr>
    <td style="padding:8px 28px;">
      <p style="margin:0 0 8px;color:#9b8d81;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">ENTREGA</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1d5c9;border-radius:4px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:#6b5c52;font-size:13px;width:35%;">Pedido #</td><td style="padding:8px 12px;color:#3d2e26;font-weight:bold;font-size:13px;">${orden_id}</td></tr>
        <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">Tipo</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${entregaLabel}</td></tr>
        <tr style="border-top:1px solid #e1d5c9;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">${tipo_entrega === 'tienda' ? 'Tienda' : 'Dirección'}</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${direccion || '—'}</td></tr>
        <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">Fecha</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${fecha_entrega || '—'}</td></tr>
        <tr style="border-top:1px solid #e1d5c9;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">Horario</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${horario || '—'}</td></tr>
        ${refs ? `<tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">Referencias</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${refs}</td></tr>` : ''}
        ${notas ? `<tr style="border-top:1px solid #e1d5c9;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">Extras</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${notas}</td></tr>` : ''}
      </table>
    </td>
  </tr>
 
  <!-- Cliente -->
  <tr>
    <td style="padding:8px 28px 20px;">
      <p style="margin:0 0 8px;color:#9b8d81;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">CLIENTE</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1d5c9;border-radius:4px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:#6b5c52;font-size:13px;width:35%;">Nombre</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;font-weight:bold;">${nombre || '—'}</td></tr>
        <tr style="border-top:1px solid #e1d5c9;background:#fafafa;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">WhatsApp</td><td style="padding:8px 12px;font-size:13px;"><a href="https://wa.me/52${tel}" style="color:#25D366;font-weight:bold;">${tel || '—'}</a></td></tr>
        <tr style="border-top:1px solid #e1d5c9;"><td style="padding:8px 12px;color:#6b5c52;font-size:13px;">Email</td><td style="padding:8px 12px;color:#3d2e26;font-size:13px;">${email || '—'}</td></tr>
      </table>
    </td>
  </tr>
 
  <!-- Footer -->
  <tr>
    <td style="background:#f9f2e8;padding:14px 28px;text-align:center;border-top:1px solid #e1d5c9;">
      <p style="margin:0;color:#9b8d81;font-size:11px;">Correo automático generado al confirmar el pago en Stripe.</p>
    </td>
  </tr>
 
</table>
</body>
</html>`;
}
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MARIBEGO backend corriendo en puerto ${PORT}`));
