// Cloudflare Pages Function: /api/data
// Fetches Shopify order data and returns aggregated bestseller stats.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const timeframe = url.searchParams.get('timeframe') || '30d';

  const token = env.SHOPIFY_TOKEN;
  const shop = env.SHOPIFY_SHOP;

  if (!token || !shop) {
    return json({ error: 'SHOPIFY_TOKEN oder SHOPIFY_SHOP nicht konfiguriert' }, 500);
  }

  try {
    const { since, until, label } = resolveTimeframe(timeframe);
    const orders = await fetchAllOrders(shop, token, since, until);

    const aggregated = aggregate(orders);
    aggregated.label = label;

    return json(aggregated, 200, {
      'Cache-Control': 'public, max-age=300'
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}

function json(data, status, extraHeaders) {
  status = status || 200;
  extraHeaders = extraHeaders || {};
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders)
  });
}

function resolveTimeframe(tf) {
  const now = new Date();
  let since;
  let until = now;
  let label;

  if (tf.indexOf('month:') === 0) {
    const parts = tf.replace('month:', '').split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    since = new Date(Date.UTC(y, m - 1, 1));
    until = new Date(Date.UTC(y, m, 1));
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    label = monthNames[m - 1] + ' ' + y;
  } else if (tf === '7d') {
    since = new Date(now.getTime() - 7 * 86400000);
    label = 'Letzte Woche';
  } else if (tf === '30d') {
    since = new Date(now.getTime() - 30 * 86400000);
    label = 'Letzter Monat';
  } else if (tf === '90d') {
    since = new Date(now.getTime() - 90 * 86400000);
    label = 'Letztes Quartal';
  } else if (tf === '365d') {
    since = new Date(now.getTime() - 365 * 86400000);
    label = 'Letztes Jahr';
  } else if (tf === 'all') {
    since = new Date('2020-01-01');
    label = 'Alle Zeiten';
  } else {
    since = new Date(now.getTime() - 30 * 86400000);
    label = 'Letzter Monat';
  }

  return { since: since, until: until, label: label };
}

async function fetchAllOrders(shop, token, since, until) {
  const orders = [];
  let pageInfo = null;
  let pageCount = 0;
  const maxPages = 50;

  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  while (pageCount < maxPages) {
    let apiUrl;
    if (pageInfo) {
      apiUrl = 'https://' + shop + '/admin/api/2024-10/orders.json?limit=250&page_info=' + pageInfo;
    } else {
      apiUrl = 'https://' + shop + '/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min=' + sinceIso + '&created_at_max=' + untilIso + '&fields=id,line_items,subtotal_price,total_price,financial_status,created_at';
    }

    const res = await fetch(apiUrl, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Shopify API ' + res.status + ': ' + errText.substring(0, 200));
    }
    const data = await res.json();
    if (data.orders) orders.push.apply(orders, data.orders);

    const linkHeader = res.headers.get('Link') || res.headers.get('link') || '';
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) {
      pageInfo = nextMatch[1];
      pageCount++;
    } else {
      break;
    }
  }

  return orders;
}

function aggregate(orders) {
  const valid = orders.filter(function(o) {
    return o.financial_status !== 'voided' && o.financial_status !== 'refunded';
  });

  let totalSales = 0;
  const totalOrders = valid.length;
  const productMap = new Map();

  for (const order of valid) {
    const orderTotal = parseFloat(order.subtotal_price || order.total_price || '0');
    totalSales += orderTotal;

    const lineItems = order.line_items || [];
    for (const item of lineItems) {
      const title = item.title || '(unbenannt)';
      const variant = item.variant_title || 'Default Title';
      const qty = item.quantity || 0;
      const price = parseFloat(item.price || '0');
      const revenue = price * qty;

      if (!productMap.has(title)) {
        productMap.set(title, {
          name: title,
          revenue: 0,
          orders: 0,
          units: 0,
          variants: new Map()
        });
      }
      const p = productMap.get(title);
      p.revenue += revenue;
      p.orders += 1;
      p.units += qty;

      if (!p.variants.has(variant)) {
        p.variants.set(variant, { variant: variant, revenue: 0, orders: 0 });
      }
      const v = p.variants.get(variant);
      v.revenue += revenue;
      v.orders += 1;
    }
  }

  const products = Array.from(productMap.values())
    .map(function(p) {
      return {
        name: p.name,
        revenue: round2(p.revenue),
        orders: p.orders,
        variants: Array.from(p.variants.values())
          .map(function(v) {
            return { variant: v.variant, revenue: round2(v.revenue), orders: v.orders };
          })
          .sort(function(a, b) { return b.revenue - a.revenue; })
      };
    })
    .sort(function(a, b) { return b.revenue - a.revenue; })
    .slice(0, 10);

  const totalRevenue = round2(products.reduce(function(s, p) { return s + p.revenue; }, 0));
  const totalSalesShop = round2(totalSales);
  const avgOrderValue = totalOrders > 0 ? round2(totalSalesShop / totalOrders) : 0;

  return {
    products: products,
    totalRevenue: totalRevenue,
    totalSalesShop: totalSalesShop,
    totalOrdersShop: totalOrders,
    avgOrderValue: avgOrderValue
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
