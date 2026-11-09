// Fantasy Chess — PayPal REST API client (Orders v2).
// Server-side only: the secret never leaves the server. `fetchImpl` can be
// injected for tests; defaults to the global fetch.

const BASES = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

class PayPalError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.body = body;
  }
}

class PayPalClient {
  constructor({ clientId, secret, env, fetchImpl }) {
    this.clientId = clientId;
    this.secret = secret;
    this.env = env === "live" ? "live" : "sandbox";
    this.base = BASES[this.env];
    this.fetch = fetchImpl || fetch;
    this._token = null;
    this._tokenExpiresAt = 0;
  }

  async getToken() {
    if (this._token && Date.now() < this._tokenExpiresAt - 30000) return this._token;
    const res = await this.fetch(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.clientId}:${this.secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new PayPalError("PayPal authentication failed", res.status, body);
    }
    this._token = body.access_token;
    this._tokenExpiresAt = Date.now() + (body.expires_in || 300) * 1000;
    return this._token;
  }

  async _call(path, method, payload) {
    const token = await this.getToken();
    const res = await this.fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new PayPalError(`PayPal ${method} ${path} failed`, res.status, body);
    }
    return body;
  }

  // Create an order for a gold pack. Returns the PayPal order object.
  // customId ties the order to the pack (read back server-side on settle).
  async createOrder({ amountCents, currency = "USD", returnUrl, cancelUrl, customId }) {
    const value = (amountCents / 100).toFixed(2);
    return this._call("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: customId || undefined, amount: { currency_code: currency, value } }],
      application_context: {
        brand_name: "Fantasy Chess",
        user_action: "PAY_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    });
  }

  async getOrder(orderId) {
    return this._call(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, "GET");
  }

  async captureOrder(orderId) {
    return this._call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, "POST", {});
  }

  // Extract the first capture from an order or capture response, if any.
  static firstCapture(orderOrCapture) {
    const units = orderOrCapture.purchase_units || [];
    for (const unit of units) {
      const captures = (unit.payments && unit.payments.captures) || [];
      if (captures.length > 0) return captures[0];
    }
    return null;
  }

  // Approve-link (rel=approve) from a created order.
  static approveUrl(order) {
    const link = (order.links || []).find((l) => l.rel === "approve");
    return link ? link.href : null;
  }
}

module.exports = { PayPalClient, PayPalError };
