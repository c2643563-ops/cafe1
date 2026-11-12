import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_FILE = path.join(process.cwd(), "data", "orders.json");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

function dbToOrder(row: any) {
  return {
    id: row.id,
    table: row.table_no,
    customer: row.customer,
    phone: row.phone || "",
    method: row.method,
    payment: row.payment,
    paymentStatus: row.payment_status,
    status: row.status,
    note: row.note || "",
    total: Number(row.total) || 0,
    createdAt: row.created_at,
    items: row.items || [],
  };
}

async function supabase(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> || {}),
    },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Database error (${response.status}): ${raw}`);
  return raw ? JSON.parse(raw) : [];
}

async function readOrders() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function writeOrders(orders: any[]) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(orders, null, 2), "utf-8");
}

export async function GET() {
  try {
    if (cloudEnabled) {
      const rows = await supabase("orders?select=*&order=created_at.desc");
      return NextResponse.json({ orders: rows.map(dbToOrder) });
    }
    if (process.env.VERCEL) {
      return NextResponse.json({ error: "Cloud database is not configured. Add the Supabase URL and anon key in Vercel Environment Variables." }, { status: 503 });
    }
    return NextResponse.json({ orders: await readOrders() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not load orders" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const method = body.method || "cash";
    const order = {
      id: body.id || `VC-${Date.now().toString().slice(-6)}`,
      table: Number(body.table) || 1,
      customer: body.customer?.trim() || "Walk-in Guest",
      phone: body.phone?.trim() || "",
      method,
      payment: method === "cash" ? "Cash" : "Online",
      paymentStatus: method === "cash" ? "Pending" : "Awaiting verification",
      status: "New",
      note: body.note?.trim() || "",
      total: Number(body.total) || 0,
      createdAt: new Date().toISOString(),
      items: Array.isArray(body.items) ? body.items : [],
    };

    if (cloudEnabled) {
      const rows = await supabase("orders", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id: order.id, table_no: order.table, customer: order.customer,
          phone: order.phone, method: order.method, payment: order.payment,
          payment_status: order.paymentStatus, status: order.status,
          note: order.note, total: order.total, created_at: order.createdAt,
          items: order.items,
        }),
      });
      return NextResponse.json({ order: rows[0] ? dbToOrder(rows[0]) : order }, { status: 201 });
    }
    if (process.env.VERCEL) {
      return NextResponse.json({ error: "Ordering database is not connected yet. Configure Supabase in Vercel first." }, { status: 503 });
    }
    const orders = await readOrders();
    orders.unshift(order);
    await writeOrders(orders);
    return NextResponse.json({ order, orders }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Order could not be saved" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, paymentStatus } = body;
    if (cloudEnabled) {
      const updates: any = {};
      if (status) updates.status = status;
      if (paymentStatus) updates.payment_status = paymentStatus;
      const rows = await supabase(`orders?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(updates),
      });
      return NextResponse.json({ orders: rows.map(dbToOrder) });
    }
    if (process.env.VERCEL) return NextResponse.json({ error: "Cloud database is not configured." }, { status: 503 });
    const orders = await readOrders();
    const updated = orders.map((o: any) => o.id !== id ? o : { ...o, ...(status ? { status } : {}), ...(paymentStatus ? { paymentStatus } : {}) });
    await writeOrders(updated);
    return NextResponse.json({ orders: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not update order" }, { status: 500 });
  }
}
