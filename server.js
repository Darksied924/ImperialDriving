require("dotenv").config();

const express = require("express");
const pool = require("./src/config/db");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Imperial Driving School Management System");
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        application: "Imperial Driving School Management System"
    });
});

app.get("/health/db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS time");

        res.json({
            status: "ok",
            database: "connected",
            time: result.rows[0].time
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            status: "error",
            database: "disconnected"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
