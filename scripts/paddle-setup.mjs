// Provision (idempotently) the Paddle catalog FluxWork's billing depends on:
// one "FluxWork Pro" product and a $9/mo recurring price. Safe to re-run — it
// reuses an existing product/price with the same name/shape instead of
// duplicating. Prints the price id to drop into NEXT_PUBLIC_PADDLE_PRICE_ID.
//
//   npm run paddle:setup   (PADDLE_API_KEY and NEXT_PUBLIC_PADDLE_ENV from .env.local)
//
// The key must match the environment: pdl_sdbx_… for sandbox, pdl_live_… for
// production. The environment defaults to sandbox.

const PRODUCT_NAME = "FluxWork Pro";
const PRICE_DESCRIPTION = "FluxWork Pro — monthly";
const UNIT_PRICE = { amount: "900", currency_code: "USD" }; // $9.00 / month

const apiKey = process.env.PADDLE_API_KEY;
const env = process.env.NEXT_PUBLIC_PADDLE_ENV ?? "sandbox";
if (!apiKey) {
  console.error("Missing PADDLE_API_KEY.");
  process.exit(1);
}
const base =
  env === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

async function paddle(path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${json.error.code}: ${json.error.detail ?? json.error.type}`,
    );
  }
  return json;
}

async function findOrCreateProduct() {
  const { data } = await paddle("/products?per_page=200&status=active");
  const existing = data.find((p) => p.name === PRODUCT_NAME);
  if (existing) {
    console.log(`product: ${existing.id} (existing)`);
    return existing.id;
  }
  const { data: created } = await paddle("/products", {
    method: "POST",
    body: JSON.stringify({
      name: PRODUCT_NAME,
      tax_category: "standard",
      type: "standard",
      description: "Unlimited clients & projects, invoicing, and exports.",
    }),
  });
  console.log(`product: ${created.id} (created)`);
  return created.id;
}

async function findOrCreatePrice(productId) {
  const { data } = await paddle(
    `/prices?per_page=200&status=active&product_id=${productId}`,
  );
  const existing = data.find(
    (p) =>
      p.billing_cycle?.interval === "month" &&
      p.billing_cycle?.frequency === 1 &&
      p.unit_price?.amount === UNIT_PRICE.amount &&
      p.unit_price?.currency_code === UNIT_PRICE.currency_code,
  );
  if (existing) {
    console.log(`price:   ${existing.id} (existing)`);
    return existing.id;
  }
  const { data: created } = await paddle("/prices", {
    method: "POST",
    body: JSON.stringify({
      product_id: productId,
      description: PRICE_DESCRIPTION,
      unit_price: UNIT_PRICE,
      billing_cycle: { interval: "month", frequency: 1 },
      tax_mode: "account_setting",
    }),
  });
  console.log(`price:   ${created.id} (created)`);
  return created.id;
}

const productId = await findOrCreateProduct();
const priceId = await findOrCreatePrice(productId);
console.log(`\nSet NEXT_PUBLIC_PADDLE_PRICE_ID=${priceId} (env: ${env})`);
