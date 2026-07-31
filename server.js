import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error(
        "SUPABASE_URL or SUPABASE_SECRET_KEY is missing"
    );
}

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type"]
    })
);

app.use(express.json());

app.use(express.static("public"));

const ALLOWED_TABLES = new Set([
    "cezoogroceries",
    "fresh_products",
    "icecreams",
    "delivery_cash_orders",
    "delivery_upi_orders",
    "upi_orders",
    "reported_issues",
    "cash_delivery_orders"
]);

const ORDERS_TABLE = "cash_delivery_orders";

app.get("/", (req, res) => {
    return res.json({
        success: true,
        message: "CEZOO API is running"
    });
});

app.get(
    "/api/table/:tableName",
    async (req, res) => {
        try {
            const tableName =
                req.params.tableName;

            if (!ALLOWED_TABLES.has(tableName)) {
                return res.status(400).json({
                    success: false,
                    message: "Table is not allowed"
                });
            }

            const page = Math.max(
                Number.parseInt(req.query.page, 10) || 1,
                1
            );

            const limit = Math.min(
                Math.max(
                    Number.parseInt(
                        req.query.limit,
                        10
                    ) || 12,
                    1
                ),
                50
            );

            const from =
                (page - 1) * limit;

            const to =
                from + limit - 1;

            const {
                data,
                error,
                count
            } = await supabase
                .from(tableName)
                .select("*", {
                    count: "exact"
                })
                .order("id", {
                    ascending: true
                })
                .range(from, to);

            if (error) {
                console.error(
                    "Supabase table error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }

            const total = count || 0;

            return res.json({
                success: true,
                table: tableName,
                page,
                limit,
                total,
                hasMore:
                    to + 1 < total,
                data: data || []
            });

        } catch (error) {
            console.error(
                "Load table error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Unable to load products"
            });
        }
    }
);

app.post(
    "/api/table/:tableName/ids",
    async (req, res) => {
        try {
            const tableName =
                req.params.tableName;

            const ids =
                req.body?.ids;

            if (!ALLOWED_TABLES.has(tableName)) {
                return res.status(400).json({
                    success: false,
                    message: "Table is not allowed"
                });
            }

            if (
                !Array.isArray(ids) ||
                ids.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "ids array is required"
                });
            }

            const cleanIds = [
                ...new Set(
                    ids
                        .map(Number)
                        .filter(Number.isInteger)
                )
            ];

            if (cleanIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "No valid product IDs supplied"
                });
            }

            const {
                data,
                error
            } = await supabase
                .from(tableName)
                .select("*")
                .in("id", cleanIds);

            if (error) {
                console.error(
                    "Supabase IDs error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }

            return res.json({
                success: true,
                table: tableName,
                count:
                    data?.length || 0,
                data: data || []
            });

        } catch (error) {
            console.error(
                "Product IDs error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Unable to load cart products"
            });
        }
    }
);


/*
 * UPDATE ONE RECORD
 * PATCH /api/table/:tableName/:id
 *
 * Example:
 * PATCH /api/table/fresh_products/12
 * Body: { "name": "Apple", "discount_price": 99 }
 */
app.patch(
    "/api/table/:tableName/:id",
    async (req, res) => {
        try {
            const tableName =
                req.params.tableName;

            const recordId =
                Number.parseInt(
                    req.params.id,
                    10
                );

            if (!ALLOWED_TABLES.has(tableName)) {
                return res.status(400).json({
                    success: false,
                    message: "Table is not allowed"
                });
            }

            if (
                !Number.isInteger(recordId) ||
                recordId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "A valid record ID is required"
                });
            }

            const updates =
                req.body;

            if (
                !updates ||
                typeof updates !== "object" ||
                Array.isArray(updates) ||
                Object.keys(updates).length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Update data is required"
                });
            }

            /*
             * Never allow the frontend to modify protected columns.
             * Add more protected column names here when needed.
             */
            const PROTECTED_FIELDS = new Set([
                "id",
                "created_at"
            ]);

            const cleanUpdates =
                Object.fromEntries(
                    Object.entries(updates)
                        .filter(
                            ([field, value]) =>
                                !PROTECTED_FIELDS.has(field) &&
                                value !== undefined
                        )
                );

            if (
                Object.keys(cleanUpdates).length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "No valid fields were supplied for update"
                });
            }

            const {
                data,
                error
            } = await supabase
                .from(tableName)
                .update(cleanUpdates)
                .eq("id", recordId)
                .select("*")
                .maybeSingle();

            if (error) {
                console.error(
                    "Supabase update error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }

            if (!data) {
                return res.status(404).json({
                    success: false,
                    message: "Record not found"
                });
            }

            return res.json({
                success: true,
                message:
                    "Record updated successfully",
                table: tableName,
                data
            });

        } catch (error) {
            console.error(
                "Update record error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Unable to update record"
            });
        }
    }
);

app.get(
    "/api/orders/test",
    (req, res) => {
        return res.json({
            success: true,
            message:
                "Cash delivery orders route is working",
            table: ORDERS_TABLE
        });
    }
);

app.post(
    "/api/orders",
    async (req, res) => {
        try {
            const order =
                req.body || {};

            const requiredFields = [
                "order_id",
                "user_name",
                "user_mobile",
                "address",
                "latitude",
                "longitude",
                "items",
                "total_items",
                "delivery_mode",
                "total_amount"
            ];

            const missingFields =
                requiredFields.filter(
                    field => {
                        const value =
                            order[field];

                        return (
                            value === undefined ||
                            value === null ||
                            value === ""
                        );
                    }
                );

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Missing required fields: " +
                        missingFields.join(", ")
                });
            }

            if (
                !Array.isArray(order.items) ||
                order.items.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Order items are required"
                });
            }

            const cleanItems =
                order.items
                    .map(item => ({
                        qty:
                            Number(item.qty || 0),

                        product_id:
                            Number(
                                item.product_id ??
                                item.id
                            ),

                        product_table:
                            String(
                                item.product_table ??
                                item.table ??
                                ""
                            )
                    }))
                    .filter(item =>
                        Number.isInteger(
                            item.product_id
                        ) &&
                        item.product_id > 0 &&
                        Number.isFinite(item.qty) &&
                        item.qty > 0 &&
                        item.product_table
                    );

            if (cleanItems.length === 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "No valid order items found"
                });
            }

            if (
                ![
                    "instant",
                    "12_hours"
                ].includes(
                    order.delivery_mode
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid delivery mode"
                });
            }

            const latitude =
                Number(order.latitude);

            const longitude =
                Number(order.longitude);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid latitude and longitude are required"
                });
            }

            const cleanOrder = {
                order_id:
                    String(order.order_id),

                user_name:
                    String(order.user_name),

                user_mobile:
                    String(order.user_mobile),

                device_token:
                    order.device_token || null,

                village:
                    order.village || null,

                address:
                    String(order.address),

                latitude,
                longitude,

                items:
                    cleanItems,

                total_items:
                    Number(
                        order.total_items || 0
                    ),

                mrp_total:
                    Number(
                        order.mrp_total || 0
                    ),

                item_total:
                    Number(
                        order.item_total || 0
                    ),

                delivery_mode:
                    order.delivery_mode,

                delivery_distance:
                    order.delivery_distance ===
                        null ||
                    order.delivery_distance ===
                        undefined
                        ? null
                        : Number(
                            order.delivery_distance
                        ),

                delivery_fee:
                    Number(
                        order.delivery_fee || 0
                    ),

                handling_fee:
                    Number(
                        order.handling_fee || 0
                    ),

                delivery_tip:
                    Number(
                        order.delivery_tip || 0
                    ),

                total_amount:
                    Number(
                        order.total_amount || 0
                    ),

                total_savings:
                    Number(
                        order.total_savings || 0
                    ),

                delivery_date:
                    order.delivery_date || null,

                delivery_time:
                    order.delivery_time || null,

                delivery_instructions:
                    Array.isArray(
                        order.delivery_instructions
                    )
                        ? order.delivery_instructions
                        : [],

                payment_method:
                    "cash_on_delivery",

                payment_status:
                    "pending",

                order_status:
                    "placed"
            };

            const {
                data,
                error
            } = await supabase
                .from(ORDERS_TABLE)
                .insert(cleanOrder)
                .select("*")
                .single();

            if (error) {
                console.error(
                    "Supabase order insert error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }

            return res.status(201).json({
                success: true,
                message:
                    "Order placed successfully",
                data
            });

        } catch (error) {
            console.error(
                "Create order error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Unable to create order"
            });
        }
    }
);

app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: "Route not found",
        method: req.method,
        path: req.path
    });
});

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `CEZOO API running on port ${PORT}`
        );

        console.log(
            "Orders table:",
            ORDERS_TABLE
        );

        console.log(
            "Orders endpoint: POST /api/orders"
        );
    }
);